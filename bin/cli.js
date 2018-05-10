#!/usr/bin/env node
"use strict";

const repl = require('repl');
const exec = require('child_process').exec;

exec(`haxe -version`, (err, stdout, stderr) => {
    if (err) {
        console.log(stderr);
        process.exit(1);
    }
    console.log('REPL Haxe', stderr);

    const extraArgs = process.argv.slice(2);
    const hxEval = require('../index')(extraArgs);
    repl.start({ prompt: '> ', eval: hxEval });
});
