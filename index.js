'use strict';

const path = require('path');
const fs = require('fs');
const vm = require('vm');
const tmp = require('tmp');
const exec = require('child_process').exec;

const reErr = /\/Repl.hx:([0-9]+): (.*)/;
const reImport = /^(import|using)\s/;
const reIdent = /^[a-z0-9_]+$/;
const reVar = /^var\s([a-z0-9_]+)/;

const WARNING = 'Warning : ';
const LINE = `untyped __js__('"<LINE>"');`;
const wrap =
`class Repl {
    static function __init__():Void {
haxe.Log.trace = function(v:Dynamic, ?infos:haxe.PosInfos) {
    untyped console.log(v);
}
${LINE}
<TOKEN>
${LINE}
    }
}`.split('<TOKEN>');

function printCompilerError(stderr) {
    const err = (stderr || '').split('\n');
    err.forEach(line => {
        const m = reErr.exec(line);
        if (m) {
            const desc = m[2];
            if (desc.indexOf(WARNING) >= 0) console.log('Haxe:', desc.split(WARNING)[1]);
            else console.log('Haxe:', desc);
        }
    });
}

function hxEval(extraArgs) {
    const imports = [];
    const buffer = [];

    const tmpDir = tmp.dirSync();
    const tmpClass = path.join(tmpDir.name, 'Repl.hx');
    const tmpOutput = path.join(tmpDir.name, 'out.js');

    const args = (extraArgs || []).concat([
        '-D', 'js-classic',
        '--no-inline',
        '--no-opt',
        '-dce', 'no',
        '-cp', tmpDir.name,
        '-js', tmpOutput,
        'Repl'
    ]).join(' ');

    return (cmd, context, filename, callback) => {
        // pre-process input
        if (cmd === undefined) return callback();
        cmd = cmd.trim();
        if (cmd == '$') {
            if (imports.length) console.log(imports.join('\n'));
            else console.log('(no imports)');
            if (buffer.length) console.log(buffer.join('\n'));
            else console.log('(no buffer)');
            return callback();
        }
        if (cmd === '') return callback();

        let lastOp = 0;
        let autoLog = null;
        let autoPop = false;
        if (reImport.test(cmd)) {
            if (cmd.charAt(cmd.length - 1) != ';') cmd += ';'; // insert semi
            imports.push(cmd);
            lastOp = 1;
        } else {
            if (reIdent.test(cmd)) autoLog = cmd;
            if (cmd.substr(0, 6) === '$type(') autoPop = true;
            if (cmd.charAt(cmd.length - 1) != ';') cmd += ';'; // insert semi
            const isVar = reVar.exec(cmd);
            if (isVar) autoLog = isVar[1];
            buffer.push(cmd);
            lastOp = 2;
        }

        // generate Haxe class
        const lines = [].concat(buffer);
        if (autoLog) {
            lines[lines.length - 1] += ` untyped __js__("{0}", ${autoLog});`;
        }
        const src = imports.join('\n')
            + wrap.join(
                lines.join(`\n${LINE}\n`)
            );
        fs.writeFileSync(tmpClass, src);

        // compile entire code
        exec(`haxe ${args}`, (err, stdout, stderr) => {
            if (err) {
                // compiler error: drop last Haxe instruction
                if (lastOp == 1) {
                    imports.pop();
                } else {
                    buffer.pop();
                }

                printCompilerError(stderr);
                return callback(null);
            }

            // warnings
            printCompilerError(stderr);

            // extract only new instructions and generate an incremental JS source
            const output = fs.readFileSync(tmpOutput).toString();
            const js = output.split('"<LINE>";\n');
            let result = null;
            const src = js[0] + js.pop() + 'undefined;\n' + (lastOp == 2 ? js.pop() : '');

            // evaluate
            try {
                const result = vm.runInThisContext(src);
                callback(null, result);
                if (autoPop) {
                    buffer.pop();
                }
            } catch (err) {
                // runtime error: drop last Haxe instruction
                if (lastOp == 1) {
                    imports.pop();
                } else {
                    buffer.pop();
                }
                console.log('Eval:', err.message);
                callback();
            }
        });
    }
}

module.exports = hxEval;
