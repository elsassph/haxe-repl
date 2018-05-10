# Haxe REPL

> A Read-Eval-Print-Loop (REPL) is a simple, interactive computer programming environment
> that takes single user inputs (i.e. single expressions), evaluates them, and returns
> the result to the user; a program written in a REPL environment is executed piecewise.

This REPL runs on top of NodeJS's native REPL support, compiling Haxe code against
the JavaScript target, and incrementally executing it.

![Haxe REPL](haxe-repl.png)

## Usage

    npm install haxe-repl -g
    haxe-repl

You will be presented with a prompt where you can enter and execute Haxe code line by line.

## Limitations

Only "body code" is allowed, which means you can't define types (e.g. `class`, `enum`...).

However you can `import` and `using` types!
