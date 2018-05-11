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
var require = untyped require;
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

function haxeRepl(extraArgs) {
    const tmpDir = tmp.dirSync();
    const tmpClass = path.join(tmpDir.name, 'Repl.hx');
    const tmpOutput = path.join(tmpDir.name, 'out.js');

    const args = (extraArgs || []).concat([
        '-D', 'js-classic',
        '-D', 'nodejs',
        '--no-inline',
        '--no-opt',
        '-dce', 'no',
        '-cp', tmpDir.name,
        '-js', tmpOutput,
        'Repl'
    ]).join(' ');

    let imports = null;
    let buffer = null;

    return (cmd, context, filename, callback) => {

        // REPL session
        if (!context.__haxe_repl__) {
            context.__haxe_repl__ = true;
            imports = [];
            buffer = [];
        }

        // pre-process input
        if (cmd === undefined) return callback();
        cmd = cmd.trim();
        if (cmd == '$') {
            if (imports.length) console.log(imports.join('\n'));
            else console.log('(no imports)');
            if (buffer.length) console.log(buffer.join('\n'));
            else console.log('(no history)');
            return callback();
        }
        if (cmd === '') return callback();

        let lastOp = 0;
        let retain = null;
        let noLog = false;
        let autoPop = false;
        if (reImport.test(cmd)) {
            if (cmd.charAt(cmd.length - 1) != ';') cmd += ';'; // insert semi
            imports.push(cmd);
            lastOp = 1;
        } else {
            if (reIdent.test(cmd)) retain = cmd;
            if (cmd.substr(0, 6) === '$type(') autoPop = true;
            if (cmd.charAt(cmd.length - 1) != ';') cmd += ';'; // insert semi
            const isVar = reVar.exec(cmd);
            if (isVar) {
                retain = isVar[1];
                noLog = true;
            }
            buffer.push(cmd);
            lastOp = 2;
        }

        // generate Haxe class
        const lines = [].concat(buffer);
        if (retain) {
            let last = lines.pop();
            last += ` untyped __js__("{0}", ${retain});`;
            if (noLog) last += ` untyped __js__("undefined");`;
            lines.push(last);
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
                return callback();
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
                const script = new vm.Script(src);
                const result = script.runInContext(context);
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

module.exports = haxeRepl;
