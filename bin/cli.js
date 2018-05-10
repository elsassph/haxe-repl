#!/usr/bin/env node
"use strict";

const repl = require('repl');
const hxEval = require('../index')();

repl.start({ prompt: '> ', eval: hxEval });
