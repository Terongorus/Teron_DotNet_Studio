# Third-Party Notices

This extension optionally builds and bundles **[SharpLsp](https://github.com/Nimblesite/SharpLsp)**,
an open-source, editor-agnostic C#/F# language server, to provide C# and F# language
intelligence (diagnostics, completions, hover, go-to-definition, outlining, and more). SharpLsp
is used entirely optionally and at the user's explicit request — see the "Optional C#/F#
Language Server" feature in [README.md](README.md) for how it's detected, downloaded, or bundled.

Its full source is vendored, unmodified, under [`third-party/SharpLsp/`](third-party/SharpLsp/)
for local building (see `tools/build-sharplsp.js`), with its own license and third-party notices
intact at [`third-party/SharpLsp/LICENSE`](third-party/SharpLsp/LICENSE) and
[`third-party/SharpLsp/THIRD-PARTY-NOTICES.md`](third-party/SharpLsp/THIRD-PARTY-NOTICES.md)
(the latter covering SharpLsp's *own* bundled dependencies - the Rust and .NET crates/packages
that make up the compiled `sharplsp` binary and its C#/F# sidecars).

## SharpLsp

Copyright (c) 2026 Christian Findlay

Homepage: https://github.com/Nimblesite/SharpLsp

Licensed under the MIT License:

```
MIT License

Copyright (c) 2026 Christian Findlay

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
