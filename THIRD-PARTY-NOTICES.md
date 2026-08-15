# Third-Party Notices

This extension optionally downloads and bundles two open-source tools, entirely at the user's
explicit request (never automatically) — see the README's "Optional C#/F# Language Server" and
debugging features for how each is detected, downloaded, or bundled. Both are fetched as
official, checksum-verified release binaries (never built from source by this extension), so no
third-party source code is vendored in this repository for either of them.

One third-party asset **is** vendored directly in this repository: the built-in "JetBrains Rider
Dark" color theme, a single static JSON file copied from its upstream source (see below) rather
than downloaded at runtime, since VS Code color themes must be declared in `package.json` at
package time.

## SharpLsp

An open-source, editor-agnostic C#/F# language server providing diagnostics, completions,
hover, go-to-definition, outlining, and more.

Copyright (c) 2026 Christian Findlay

Homepage: [https://github.com/Nimblesite/SharpLsp](https://github.com/Nimblesite/SharpLsp)

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

## JetBrains Rider Dark Theme

A VS Code color theme (`resources/themes/jetbrains-rider-dark-theme.json`) based on JetBrains
Rider's own dark theme, vendored as a static file and contributed as a built-in theme
(`.NET Studio: JetBrains Rider Dark`).

Copyright (c) 2022 Ed Sulaiman

Homepage: [https://github.com/edsulaiman/jetbrains-rider-dark-theme](https://github.com/edsulaiman/jetbrains-rider-dark-theme)

Licensed under the MIT License:

```
MIT License

Copyright (c) 2022 Ed Sulaiman

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

## netcoredbg

A standalone Debug Adapter Protocol server for .NET, used by this extension's own debug type
(`dotnet-studio-debug`) so breakpoint/stepping debugging works without Microsoft's C# extension.

Copyright (c) 2017 Samsung Electronics Co., LTD

Homepage: [https://github.com/Samsung/netcoredbg](https://github.com/Samsung/netcoredbg)

Licensed under the MIT License:

```
MIT License

Copyright (c) 2017 Samsung Electronics Co., LTD

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
