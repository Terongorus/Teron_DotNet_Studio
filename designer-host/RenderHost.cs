using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Xml.Linq;

namespace DesignerHost;

/// <summary>
/// Renders XAML documents into hidden, off-screen WPF Windows purely as render targets
/// (see DocumentState.ContainerWindow) - parked off any monitor's virtual-screen bounds
/// (rather than never-shown) so each has a real PresentationSource, for correct
/// DPI/layout/animation behavior.
/// </summary>
internal sealed class RenderHost
{
    private const int DefaultWidth = 1024;
    private const int DefaultHeight = 768;

    /// <summary>
    /// Everything SelectAt/CommitTransform need to operate against a specific document,
    /// keyed by file path (see DocumentKey) - NOT a single shared "last render" slot.
    /// One host process is shared across every open preview panel of a given platform
    /// (see designerHostClient.ts), so a single slot would let rendering document B
    /// silently redirect a drag already in progress against document A's panel onto B's
    /// document instead - wrong-file corruption, not just a stale preview. ContainerWindow
    /// is either a dedicated off-screen host (element roots) or the parsed root itself
    /// (window roots) - either way it's this document's own, never shared with another.
    /// </summary>
    private sealed class DocumentState
    {
        public required XDocument PristineDocument { get; init; }
        public required Visual RootVisual { get; init; }
        public required Window ContainerWindow { get; init; }
        public string? AssemblyPath { get; init; }
        public string? AppXamlText { get; init; }
    }

    // Entries are never removed when a panel closes (matching 1a, which never notified this
    // process of panel lifetime either) - an accepted, minor per-process resource leak rather
    // than a correctness issue, bounded by however many distinct files get previewed in one
    // session.
    private readonly Dictionary<string, DocumentState> _documents = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>Empty-string fallback only matters for a hypothetical caller with no file path at all - this extension's own panel always provides a real one.</summary>
    private static string DocumentKey(string? filePath) => filePath ?? "";

    /// <summary>
    /// Must be called on the WPF dispatcher thread. Throws on parse/layout
    /// failure - the caller is responsible for reporting that as an `error`
    /// message rather than letting it escape.
    /// </summary>
    public (int Width, int Height, string PngBase64) Render(string xamlText, string? filePath, string? assemblyPath, string? appXamlText)
    {
        // Parsed from the raw, unmodified text - never mutated - and kept as the source
        // of truth for CommitTransform's write-back. The clr-namespace qualification and
        // x:Class/event-handler stripping below apply only to a separate render copy
        // (see RenderFromPristineDocument), so a save-back can never leak those into the
        // real file.
        var pristineDocument = XDocument.Parse(xamlText);
        return RenderFromPristineDocument(DocumentKey(filePath), pristineDocument, filePath, assemblyPath, appXamlText);
    }

    /// <summary>
    /// Must be called on the WPF dispatcher thread, against a point in filePath's most
    /// recently rendered document (device pixels, same units the captured PNG uses -
    /// RenderTargetBitmap at 96 DPI makes that a 1:1 mapping). Returns null if the point
    /// hit nothing trackable (e.g. empty canvas background) or filePath was never rendered.
    /// </summary>
    public (string Path, Rect Bounds)? SelectAt(string? filePath, double x, double y)
    {
        if (!_documents.TryGetValue(DocumentKey(filePath), out var state)) { return null; }

        var hit = SelectionService.HitTest(state.RootVisual, new Point(x, y));
        if (hit is null) { return null; }

        var (element, path) = hit.Value;
        return (path, SelectionService.GetBounds(element, state.RootVisual));
    }

    /// <summary>
    /// Must be called on the WPF dispatcher thread. Applies one committed drag/resize to
    /// filePath's pristine document and re-renders from it - the returned frame reflects
    /// the edited state immediately, without waiting for the save-triggered render cycle,
    /// and XamlText is the real file content the extension should write back through
    /// VS Code's document API (this process never touches the file on disk itself).
    /// </summary>
    public (int Width, int Height, string PngBase64, string XamlText) CommitTransform(string? filePath, string path, TransformKind kind, Rect newBounds)
    {
        var key = DocumentKey(filePath);
        if (!_documents.TryGetValue(key, out var state))
        {
            throw new InvalidOperationException("No active render of this file to commit against - try re-opening the preview.");
        }

        var pristineElement = SourcePathTracker.Find(state.PristineDocument, path)
            ?? throw new InvalidOperationException($"Could not locate the selected element (path \"{path}\") in the current document.");

        // Recomputed fresh against the current render rather than trusting a
        // client-echoed original - the client only ever reports the *new* bounds.
        var renderElement = SelectionService.FindByPath(state.RootVisual, path)
            ?? throw new InvalidOperationException($"Could not locate the selected element (path \"{path}\") in the current render.");
        var originalBounds = SelectionService.GetBounds(renderElement, state.RootVisual);
        var mode = SelectionService.DeterminePositioningMode(renderElement);

        TransformApplier.Apply(pristineElement, mode, kind, originalBounds, newBounds);

        var (width, height, pngBase64) = RenderFromPristineDocument(key, state.PristineDocument, filePath, state.AssemblyPath, state.AppXamlText);
        return (width, height, pngBase64, state.PristineDocument.ToString());
    }

    /// <summary>
    /// Reusable by both a normal render (from freshly parsed text) and a post-commit
    /// re-render (from the same pristine document, now mutated in place by
    /// TransformApplier) - either way, a fresh render copy is derived from whatever the
    /// pristine document currently contains.
    /// </summary>
    private (int Width, int Height, string PngBase64) RenderFromPristineDocument(string key, XDocument pristineDocument, string? filePath, string? assemblyPath, string? appXamlText)
    {
        var (renderDocument, rootLocalName) = PrepareXaml(pristineDocument.ToString(), assemblyPath);

        if (rootLocalName is "Application" or "ResourceDictionary")
        {
            // Application.xaml/App.xaml defines app-level resources and
            // startup config, not a visual tree - and XamlReader can only
            // ever construct one Application instance per process anyway
            // (this host already created its own), so parsing one throws a
            // confusing WPF-internal exception rather than a useful one.
            throw new NotSupportedException(
                $"'{rootLocalName}' is not a visual root, so there's nothing to preview. " +
                "Open a Window, UserControl, or Page file instead.");
        }

        if (!string.IsNullOrEmpty(assemblyPath))
        {
            AssemblyLoader.EnsureLoaded(assemblyPath);
        }

        // Re-applied on every render (not just once) so editing App.xaml's resources and
        // re-saving the previewed file picks up the change, consistent with the rest of
        // the preview being "reload from source on every save". Application.Current.Resources
        // is process-global (one Application instance per host), so this remains a
        // pre-existing 1a limitation shared across every open document in this process,
        // not something 1b introduces or fixes: rendering document B can transiently
        // change what document A's *next* render sees as app-level resources.
        if (!string.IsNullOrEmpty(appXamlText))
        {
            ApplyApplicationResources(appXamlText, assemblyPath);
        }

        // Only on the render copy - never on the pristine document, which must stay
        // exactly what a write-back should reproduce.
        SourcePathTracker.AssignPaths(renderDocument);

        var parserContext = new ParserContext();
        if (!string.IsNullOrEmpty(filePath))
        {
            parserContext.BaseUri = new Uri(filePath);
        }

        var parsed = XamlReader.Parse(renderDocument.ToString(), parserContext);

        // This document's own previous container (whatever kind it was) is only closed
        // now, once its replacement is about to take over - never another document's, and
        // never in a `finally` right after capture, which would leave nothing left to
        // hit-test afterward for a Window-rooted file.
        if (_documents.TryGetValue(key, out var previous))
        {
            previous.ContainerWindow.Close();
        }

        var (width, height, pngBase64, rootVisual, containerWindow) = parsed switch
        {
            Window window => RenderWindowRoot(window),
            FrameworkElement element => RenderElementRoot(element),
            _ => throw new NotSupportedException($"Unsupported XAML root: {parsed?.GetType().FullName ?? "null"}")
        };

        _documents[key] = new DocumentState
        {
            PristineDocument = pristineDocument,
            RootVisual = rootVisual,
            ContainerWindow = containerWindow,
            AssemblyPath = assemblyPath,
            AppXamlText = appXamlText
        };

        return (width, height, pngBase64);
    }

    private static (int Width, int Height, string PngBase64, Visual RootVisual, Window ContainerWindow) RenderElementRoot(FrameworkElement content)
    {
        // A fresh, dedicated off-screen host per render (not one shared instance) - so an
        // older render's container (and the document state pointing at it) never gets its
        // Content silently swapped out from under it by a different document's render.
        var container = CreateOffscreenWindow();
        container.Content = content;

        var width = double.IsNaN(content.Width) || content.Width <= 0 ? DefaultWidth : (int)Math.Ceiling(content.Width);
        var height = double.IsNaN(content.Height) || content.Height <= 0 ? DefaultHeight : (int)Math.Ceiling(content.Height);
        container.Width = width;
        container.Height = height;

        container.Show();
        container.UpdateLayout();

        var (capturedWidth, capturedHeight, pngBase64) = CaptureFrame(container, width, height);
        return (capturedWidth, capturedHeight, pngBase64, container, container);
    }

    private static (int Width, int Height, string PngBase64, Visual RootVisual, Window ContainerWindow) RenderWindowRoot(Window window)
    {
        // A parsed root <Window> can't be reparented as another Window's Content, so it's
        // already its own off-screen render target - no separate container needed.
        window.WindowStartupLocation = WindowStartupLocation.Manual;
        window.Left = -32000;
        window.Top = -32000;
        window.ShowInTaskbar = false;

        var width = double.IsNaN(window.Width) || window.Width <= 0 ? DefaultWidth : (int)Math.Ceiling(window.Width);
        var height = double.IsNaN(window.Height) || window.Height <= 0 ? DefaultHeight : (int)Math.Ceiling(window.Height);
        window.Width = width;
        window.Height = height;

        window.Show();
        window.UpdateLayout();
        var (capturedWidth, capturedHeight, pngBase64) = CaptureFrame(window, width, height);

        return (capturedWidth, capturedHeight, pngBase64, window, window);
    }

    private static (int Width, int Height, string PngBase64) CaptureFrame(Visual visual, int width, int height)
    {
        var bitmap = new RenderTargetBitmap(width, height, 96, 96, PixelFormats.Pbgra32);
        bitmap.Render(visual);

        var encoder = new PngBitmapEncoder();
        encoder.Frames.Add(BitmapFrame.Create(bitmap));

        using var memoryStream = new MemoryStream();
        encoder.Save(memoryStream);

        return (width, height, Convert.ToBase64String(memoryStream.ToArray()));
    }

    private static Window CreateOffscreenWindow() => new()
    {
        WindowStartupLocation = WindowStartupLocation.Manual,
        Left = -32000,
        Top = -32000,
        ShowInTaskbar = false,
        WindowStyle = WindowStyle.None,
        ResizeMode = ResizeMode.NoResize,
        Width = DefaultWidth,
        Height = DefaultHeight
    };

    /// <summary>
    /// XamlReader can't process compiled code-behind (x:Class) - it silently
    /// ignores InitializeComponent/event wiring/constructor-registered
    /// converters either way, but leaving the attribute in place makes some
    /// parsers look for a compiled type that doesn't exist here and throw.
    /// Stripping it up front makes the "visual tree only, no code-behind"
    /// limitation an explicit, predictable behavior instead of an occasional
    /// parse failure. Also returns the root element's local name so the
    /// caller can reject non-visual roots (Application/ResourceDictionary)
    /// before handing them to XamlReader.
    /// </summary>
    private static (XDocument RenderDocument, string RootLocalName) PrepareXaml(string xamlText, string? assemblyPath)
    {
        // Qualify bare clr-namespace: xmlns declarations BEFORE parsing into
        // an XDocument, not after - an XDocument element's resolved XName is
        // bound to its namespace at parse time, so mutating a namespace
        // *declaration* attribute's value afterward doesn't retroactively
        // change already-parsed descendant elements using that prefix; they
        // silently re-serialize with the original (unqualified) URI. Doing
        // this as a plain text rewrite sidesteps that entirely.
        var preprocessed = string.IsNullOrEmpty(assemblyPath)
            ? xamlText
            : QualifyBareClrNamespaces(xamlText, Path.GetFileNameWithoutExtension(assemblyPath));

        var doc = XDocument.Parse(preprocessed);
        var root = doc.Root;
        if (root is null)
        {
            return (doc, "");
        }

        XNamespace xNamespace = "http://schemas.microsoft.com/winfx/2006/xaml";
        root.Attribute(xNamespace + "Class")?.Remove();

        StripLikelyEventHandlers(doc);

        return (doc, root.Name.LocalName);
    }

    private static readonly HashSet<string> LikelyEventAttributeNames = new(StringComparer.Ordinal)
    {
        "Click", "DoubleClick", "Loaded", "Unloaded", "Initialized", "Closed", "Closing",
        "Activated", "Deactivated", "Checked", "Unchecked", "Indeterminate",
        "SelectionChanged", "SelectedIndexChanged", "TextChanged", "ValueChanged",
        "Executed", "CanExecute", "PreviewExecuted", "PreviewCanExecute",
        "MouseDown", "MouseUp", "MouseMove", "MouseEnter", "MouseLeave", "MouseWheel",
        "MouseLeftButtonDown", "MouseLeftButtonUp", "MouseRightButtonDown", "MouseRightButtonUp",
        "PreviewMouseDown", "PreviewMouseUp", "PreviewMouseMove",
        "PreviewMouseLeftButtonDown", "PreviewMouseLeftButtonUp",
        "KeyDown", "KeyUp", "PreviewKeyDown", "PreviewKeyUp", "TextInput", "PreviewTextInput",
        "GotFocus", "LostFocus", "GotKeyboardFocus", "LostKeyboardFocus",
        "Drop", "DragEnter", "DragLeave", "DragOver", "QueryContinueDrag", "GiveFeedback",
        "SizeChanged", "LayoutUpdated", "TargetUpdated", "SourceUpdated",
        "ContextMenuOpening", "ContextMenuClosing", "ToolTipOpening", "ToolTipClosing",
        "Expanded", "Collapsed", "ScrollChanged", "RequestNavigate"
    };

    private static readonly Regex BareIdentifier = new(@"^[A-Za-z_][A-Za-z0-9_]*$", RegexOptions.Compiled);
    private static readonly Regex OnHandlerName = new(@"^On[A-Z]\w*$", RegexOptions.Compiled);

    /// <summary>
    /// Best-effort removal of attributes that look like code-behind
    /// event/command handler wiring (e.g. Click="OnClick", a CommandBinding's
    /// Executed="..."). This preview has no x:Class instance to bind handlers
    /// to - for most properties XamlReader silently no-ops when it can't
    /// resolve one, but for some (notably CommandBinding.Executed) it throws
    /// and blocks the entire render instead of just that one element.
    /// Heuristic, not exhaustive: matches known WPF event/command property
    /// names, or any bare-identifier value following the common "OnXxx"
    /// handler naming convention - and only ever touches attributes whose
    /// value is a plain identifier, never markup extensions like
    /// {Binding ...} or free-text content, to keep false positives rare.
    /// </summary>
    private static void StripLikelyEventHandlers(XDocument doc)
    {
        foreach (var element in doc.Descendants().ToList())
        {
            foreach (var attribute in element.Attributes().ToList())
            {
                if (attribute.IsNamespaceDeclaration) { continue; }
                if (!BareIdentifier.IsMatch(attribute.Value)) { continue; }

                var localName = attribute.Name.LocalName;
                var dotIndex = localName.LastIndexOf('.');
                var propertyName = dotIndex >= 0 ? localName[(dotIndex + 1)..] : localName;

                if (LikelyEventAttributeNames.Contains(propertyName) || OnHandlerName.IsMatch(attribute.Value))
                {
                    attribute.Remove();
                }
            }
        }
    }

    /// <summary>
    /// App.xaml's &lt;Application.Resources&gt; (styles, brushes, converters
    /// registered as resources, etc.) are ambient to every window in a real
    /// running app via Application.Current.Resources - previewing a single
    /// Window/UserControl in isolation would otherwise fail on any
    /// StaticResource defined only at the app level. XamlReader.Parse can't
    /// construct the &lt;Application&gt; root directly (only one Application
    /// instance is allowed per process, and this host already made its own),
    /// so instead we lift just the resources into a standalone
    /// ResourceDictionary and install it as this host's own
    /// Application.Resources.
    /// </summary>
    private static void ApplyApplicationResources(string appXamlText, string? assemblyPath)
    {
        var dictionaryElement = ExtractApplicationResourcesElement(appXamlText);
        if (dictionaryElement is null)
        {
            return;
        }

        var dictionaryXaml = dictionaryElement.ToString();
        if (!string.IsNullOrEmpty(assemblyPath))
        {
            dictionaryXaml = QualifyBareClrNamespaces(dictionaryXaml, Path.GetFileNameWithoutExtension(assemblyPath));
        }

        if (XamlReader.Parse(dictionaryXaml) is ResourceDictionary dictionary)
        {
            Application.Current.Resources = dictionary;
        }
    }

    private static XElement? ExtractApplicationResourcesElement(string appXamlText)
    {
        XElement root;
        try
        {
            root = XDocument.Parse(appXamlText).Root ?? throw new InvalidOperationException();
        }
        catch
        {
            return null;
        }

        XNamespace presentationNamespace = "http://schemas.microsoft.com/winfx/2006/xaml/presentation";
        var resourcesElement = root.Element(presentationNamespace + "Application.Resources");
        if (resourcesElement is null)
        {
            return null;
        }

        // The resource contents may reference custom types via prefixes
        // declared on the <Application> root (e.g. xmlns:svc="clr-namespace:
        // ...") rather than on Application.Resources itself, so those
        // declarations need to be carried over onto the standalone
        // ResourceDictionary wrapper.
        var dictionary = new XElement(presentationNamespace + "ResourceDictionary");
        foreach (var declaration in root.Attributes().Where(a => a.IsNamespaceDeclaration))
        {
            dictionary.Add(new XAttribute(declaration.Name, declaration.Value));
        }
        foreach (var child in resourcesElement.Elements())
        {
            dictionary.Add(child);
        }

        return dictionary;
    }

    private static readonly Regex BareClrNamespaceAttribute = new(
        @"(xmlns(?::\w+)?\s*=\s*)(""|')clr-namespace:([^""';]+)\2",
        RegexOptions.Compiled);

    /// <summary>
    /// `clr-namespace:Foo` (no `;assembly=`) means "the same assembly as the
    /// compiled markup" - a concept that only exists for BAML compiled with a
    /// known x:Class assembly. XamlReader.Parse has no such context, so a
    /// bare same-assembly reference (the overwhelmingly common case for a
    /// single-assembly app's own converters/controls, e.g.
    /// `xmlns:local="clr-namespace:MyApp.Converters"`) fails to resolve
    /// unless rewritten to explicitly name the assembly we just loaded.
    /// </summary>
    private static string QualifyBareClrNamespaces(string xamlText, string assemblyName)
    {
        return BareClrNamespaceAttribute.Replace(xamlText, match =>
        {
            var declaration = match.Groups[1].Value;
            var quote = match.Groups[2].Value;
            var ns = match.Groups[3].Value;
            return $"{declaration}{quote}clr-namespace:{ns};assembly={assemblyName}{quote}";
        });
    }
}
