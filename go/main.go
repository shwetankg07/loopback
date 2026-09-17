// Go support: yaegi (a Go interpreter written in Go) built for wasip1, so Go runs in the browser like the other
// WASI toolchains. Usage: yaegi /main.go — reads the file, evaluates it, then calls main().
package main

import (
	"fmt"
	"os"

	"github.com/traefik/yaegi/interp"
	"github.com/traefik/yaegi/stdlib"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: yaegi <file.go>")
		os.Exit(2)
	}
	src, err := os.ReadFile(os.Args[1])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	i := interp.New(interp.Options{
		Stdin:  os.Stdin,
		Stdout: os.Stdout,
		Stderr: os.Stderr,
		Args:   os.Args[1:],
	})
	if err := i.Use(stdlib.Symbols); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	// Evaluating a main package runs main() itself, so there's nothing to call afterwards.
	if _, err := i.Eval(string(src)); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
