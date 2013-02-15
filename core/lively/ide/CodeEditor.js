module('lively.ide.CodeEditor').requires('lively.morphic.TextCore', 'lively.morphic.Widgets', 'lively.ide.BrowserFramework').requiresLib({url: Config.codeBase + (lively.useMinifiedLibs ? 'lib/lively-ace.min.js' : 'lib/lively-ace.js'), loadTest: function() { return typeof ace !== 'undefined';}}).toRun(function() {

lively.ide.ace = {
    // currently supported: see availableTextModes
    // available but not loaded by default are:
    // "asciidoc", "c9search", "c_cpp", "coldfusion", "csharp", "curly",
    // "dot", "glsl", "golang", "groovy", "haxe", "jsp", "jsx", "liquid",
    // "lua", "luapage", "lucene", "ocaml", "perl", "pgsql", "php",
    // "powershell", "rhtml", "ruby", "scad", "scala", "scss", "stylus",
    // "tcl", "tex", "textile", "typescript", "vbscript", "xquery", "yaml"
    availableTextModes: ["abap", "clojure", "coffee", "css", "dart", "diff", "haml", "html",
                         "jade", "java", "javascript", "json", "latex", "less", "lisp",
                         "makefile", "markdown", "objectivec", "python", "r", "rdoc", "sh",
                         "sql", "svg", "text", "xml"],

    moduleNameForTextMode: function(textModeName) {
        return this.availableTextModes.include(textModeName) ?
            "ace/mode/" + textModeName : null;
    },

    // supported: see availableThemes
    // not loaded by default are:
    // "ambiance", "chaos", "chrome", "clouds", "clouds_midnight",
    // "cobalt", "crimson_editor", "dawn", "dreamweaver", "eclipse",
    // "github", "idle_fingers", "kr", "merbivore", "merbivore_soft",
    // "mono_industrial", "monokai", "pastel_on_dark", "solarized_dark",
    // "solarized_light", "textmate", "tomorrow", "tomorrow_night",
    // "tomorrow_night_blue", "tomorrow_night_bright",
    // "tomorrow_night_eighties", "twilight", "vibrant_ink", "xcode"

    availableThemes: ["ambiance", "monokai", "chrome", "pastel_on_dark", "textmate",
                      "solarized_dark", "twilight", "tomorrow", "tomorrow_night",
                      "tomorrow_night_blue", "tomorrow_night_bright", "eclipse"],

    moduleNameForTheme: function(themeName) {
        return this.availableThemes.include(themeName) ?
            "ace/theme/" + themeName : null
    }
}

lively.morphic.Morph.subclass('lively.morphic.CodeEditor',
'settings', {
    style: {
        enableGrabbing: false
    },
    doNotSerialize: ['aceEditor', 'aceEditorAfterSetupCallbacks', 'savedTextString'],
    evalEnabled: true,
    isAceEditor: true
},
'initializing', {
    initialize: function($super, bounds, string) {
        bounds = bounds || lively.rect(0,0,400,300);
        var shape = new lively.morphic.Shapes.External(document.createElement('div'));

        // FIXME those functions should go somewhere else...
        (function onstore() {
            var node = this.shapeNode;
            if (!node) return;
            this.extent = this.getExtent();
        }).asScriptOf(shape);

        (function onrestore() {
            this.shapeNode = document.createElement('div');
            this.shapeNode.style.width = this.extent.x + 'px';
            this.shapeNode.style.height = this.extent.y + 'px';
            this.setExtent(this.extent);
        }).asScriptOf(shape);

        $super(shape);
        this.setBounds(bounds);
        this.textString = string || '';
    },

    onOwnerChanged: function(newOwner) {
        if (newOwner) this.initializeAce();
    }
},
'serialization', {
    onLoad: function() {
        this.initializeAce();
    },

    onstore: function($super) {
        $super();
        var self = this;
        this.withAceDo(function(ed) {
            self.storedTextString = ed.getSession().getDocument().getValue();
        });
    },

    onrestore: function($super) {
        $super();
        if (this.storedTextString) {
            this.textString = this.storedTextString;
            delete this.storedTextString;
        }
    }
},
'accessing', {
    getGrabShadow: function() { return null; },
    setExtent: function($super, extent) {
        $super(extent);
        this.withAceDo(function(ed) { ed.resize(); });
        return extent;
    }
},
'ace', {
    initializeAce: function() {
        // 1) create ace editor object
        var node = this.getShape().shapeNode,
            e = this.aceEditor = this.aceEditor || ace.edit(node),
            morph = this;
        this.aceEditor.on('focus', function() { morph._isFocused = true; })
        this.aceEditor.on('blur', function() { morph._isFocused = false; })
        node.setAttribute('id', 'ace-editor');
        // 2) set modes / themes
        e.getSession().setMode("ace/mode/javascript");
        this.setStyleSheet('#ace-editor {'
                          + ' position:absolute;'
                          + ' top:0;'
                          + ' bottom:0;left:0;right:0;'
                          + ' font-family: Monaco,monospace;'
                          + ' font-size: ' + Config.get('defaultCodeFontSize') + 'pt;'
                          + '}');
        this.setupKeyBindings();
        e.setTheme("ace/theme/chrome");

        // 2) run after setup callbacks
        var cbs = this.aceEditorAfterSetupCallbacks;
        if (!cbs) return;
        delete this.aceEditorAfterSetupCallbacks;
        var cb;
        while ((cb = cbs.shift())) { cb(e); }
    },

    addCommands: function(commands) {
        var e = this.aceEditor,
            handler = e.commands,
            platform = handler.platform; // mac or win

        function lookupCommand(keySpec) {
            keySpec.split('|').detect(function(keys) {
                var binding = e.commands.parseKeys(keys),
                    command = e.commands.findKeyCommand(binding.hashId, binding.key);
                return command && command.name;
            });
        }

        function addCommands(commandList) {
            // first remove a keybinding if one already exists
            commandList.forEach(function(cmd) {
                var keys = cmd.bindKey && (cmd.bindKey[platform] || cmd.bindKey),
                    existing = keys && lookupCommand(keys);
                if (existing) handler.removeCommand(existing);
            });
            handler.addCommands(commandList);
        }

        addCommands(commands);
    },

    setupKeyBindings: function() {
        this.addCommands([
            // evaluation
            {
                name: 'doit',
                bindKey: {win: 'Ctrl-D',  mac: 'Command-D'},
                exec: this.doit.bind(this, false),
                multiSelectAction: "forEach",
                readOnly: false // false if this command should not apply in readOnly mode
            }, {
                name: 'printit',
                bindKey: {win: 'Ctrl-P',  mac: 'Command-P'},
                exec: this.doit.bind(this, true),
                multiSelectAction: "forEach",
                readOnly: false
            }, {
                name: 'list protocol',
                bindKey: {win: 'Ctrl-Shift-P',  mac: 'Command-Shift-P'},
                exec: this.doListProtocol.bind(this),
                multiSelectAction: "single",
                readOnly: false
            }, {
                name: 'doSave',
                bindKey: {win: 'Ctrl-S',  mac: 'Command-S'},
                exec: this.doSave.bind(this),
                multiSelectAction: "single",
                readOnly: false
            }, {
                name: 'doInspect',
                bindKey: {win: 'Ctrl-I',  mac: 'Command-I'},
                exec: this.doInspect.bind(this),
                multiSelectAction: "forEach",
                readOnly: true
            },
            // selection / movement
            {
                name: 'clearSelection',
                bindKey: 'Escape',
                exec: this.clearSelection.bind(this),
                readOnly: true
            },
            {
                name: 'moveForwardToMatching',
                bindKey: {win: 'Ctrl-Right',  mac: 'Command-Right'},
                exec: this.moveForwardToMatching.bind(this, false),
                multiSelectAction: "forEach",
                readOnly: true
            }, {
                name: 'moveBackwardToMatching',
                bindKey: {win: 'Ctrl-Left',  mac: 'Command-Left'},
                exec: this.moveBackwardToMatching.bind(this, false),
                multiSelectAction: "forEach",
                readOnly: true
            }, {
                name: 'selectToMatchingForward',
                bindKey: {win: 'Ctrl-Shift-Right',  mac: 'Command-Shift-Right'},
                exec: this.moveForwardToMatching.bind(this, true),
                multiSelectAction: "forEach",
                readOnly: true
            }, {
                name: 'selectToMatchingBackward',
                bindKey: {win: 'Ctrl-Shift-Left',  mac: 'Command-Shift-Left'},
                exec: this.moveBackwardToMatching.bind(this, true),
                multiSelectAction: "forEach",
                readOnly: true
            }, {
                name: "selecttolinestart",
                bindKey: 'Shift-Home|Ctrl-Shift-A',
                exec: function(editor) { editor.getSelection().selectLineStart(); },
                multiSelectAction: "forEach",
                readOnly: true
            }, {
                name: "gotolinestart",
                bindKey: "Home|Ctrl-A",
                exec: function(editor) { editor.navigateLineStart(); },
                multiSelectAction: "forEach",
                readOnly: true
            }, {
                name: "selecttolineend",
                bindKey: "Shift-End|Ctrl-Shift-E",
                exec: function(editor) { editor.getSelection().selectLineEnd(); },
                multiSelectAction: "forEach",
                readOnly: true
            }, {
                name: "gotolineend",
                bindKey: "End|Ctrl-E",
                exec: function(editor) { editor.navigateLineEnd(); },
                multiSelectAction: "forEach",
                readOnly: true
            }, {
                name: "searchWithPrompt",
                bindKey: {win: "Ctrl-F", mac: "Command-F"},
                exec: this.searchWithPrompt.bind(this),
                readOnly: true
            }]);
    },

    setupRobertsKeyBindings: function() {
        // that.setupKeyBindings()
        var e = this.aceEditor, lkKeys = this;
        this.loadAceModule(["keybinding", 'ace/keyboard/emacs'], function(emacsKeys) {
            e.setKeyboardHandler(emacsKeys.handler);
            var kbd = e.getKeyboardHandler();
            kbd.addCommand({name: 'doit', exec: lkKeys.doit.bind(lkKeys, false) });
            kbd.addCommand({name: 'printit', exec: lkKeys.doit.bind(lkKeys, true)});
            kbd.addCommand({name: 'doListProtocol', exec: lkKeys.doListProtocol.bind(lkKeys)});
            kbd.bindKeys({"s-d": 'doit', "s-p": 'printit', "S-s-p": 'doListProtocol'});
        });
    },

    withAceDo: function(doFunc) {
        if (this.aceEditor) return doFunc(this.aceEditor);
        if (!this.aceEditorAfterSetupCallbacks) this.aceEditorAfterSetupCallbacks = [];
        this.aceEditorAfterSetupCallbacks.push(doFunc);
        return undefined;
    },

    loadAceModule: function(moduleName, callback) {
        return ace.require('./config').loadModule(moduleName, callback);
    },

    indexToPosition: function(absPos) {
        return this.withAceDo(function(ed) { return ed.session.doc.indexToPosition(absPos); });
    }

},
'ace interface', {
    setCursorPosition: function(pos) {
        return this.withAceDo(function(ed) {
            ed.selection.moveCursorToPosition({column: pos.x, row: pos.y}); });
    },

    getCursorPosition: function() {
        return this.withAceDo(function(ed) {
            var pos = ed.getCursorPosition();
            return lively.pt(pos.column, pos.row); });
    },

    moveToMatching: function(forward, shouldSelect, moveAnyway) {
        // This method tries to find a matching char to the one the cursor
        // currently points at. If a match is found it is set as the new
        // position. In case there is no match but moveAnyway is truthy try to
        // move forward over words. A selection range is created when
        // shouldSelect is truthy.
        return this.withAceDo(function(ed) {
            var pos = ed.getCursorPosition(),
                range = ed.session.getBracketRange(pos),
                sel = ed.selection;
            if (!range
              || (forward && !range.isStart(pos.row, pos.column))
              || (!forward && !range.isEnd(pos.row, pos.column))) {
                if (!moveAnyway) return;
                var method = (shouldSelect ? "selectWord" : "moveCursorWord")
                           + (forward ? "Right" : "Left");
                sel[method]();
            } else {
                var to = forward ? range.end : range.start;
                if (!shouldSelect) {
                    sel.moveCursorToPosition(to);
                } else {
                    sel.selectToPosition(to);
                }
            }
        });
    },

    moveForwardToMatching: function(shouldSelect, moveAnyway) {
        this.moveToMatching(true, shouldSelect, moveAnyway);
    },

    moveBackwardToMatching: function(shouldSelect, moveAnyway) {
        this.moveToMatching(false, shouldSelect, moveAnyway);
    },

    clearSelection: function() { this.withAceDo(function(ed) { ed.clearSelection(); }) }

},
'search and find', {

    searchWithPrompt: function() {
        var world = this.world();
        if (!world) return;
        this.withAceDo(function(ed) {
            world.prompt('Enter text or regexp to search for.', function(input) {
                if (!input) { ed.focus(); return };
                var regexpMatch = input.match(/^\/(.*)\/$/),
                    needle = regexpMatch && regexpMatch[1] ? new RegExp(regexpMatch[1], "g") : input;
                ed.focus();
                ed.find({
                    needle: needle,
                    preventScroll: false,
                    skipCurrent: true,
                    start: ed.getCursorPosition(),
                    wrap: false
                });
            });
        });
    }
},
'event handling', {
    onMouseDown: function($super, evt) {
        // ace installs a mouseup event handler on the document level and
        // stops the event so it never reaches our Morphic event handlers. To
        // still dispatch the event properly we install an additional mouseup
        // handler that is removed immediately thereafter
        var self = this;
        function upHandler(evt) {
            document.removeEventListener("mouseup", upHandler, true);
            lively.morphic.EventHandler.prototype.patchEvent(evt);
            self.onMouseUpEntry(evt);
        }
        document.addEventListener("mouseup", upHandler, true);
        return $super(evt);
    }
},
'text morph eval interface', {

    tryBoundEval: function(string) {
        try {
            return this.boundEval(string);
        } catch(e) {
            return e;
        }
    },

    boundEval: function (str) {
        // Evaluate the string argument in a context in which "this" may be supplied by the modelPlug
        var ctx = this.getDoitContext() || this,
            interactiveEval = function(text) { return eval(text) };
        return interactiveEval.call(ctx, str);
    },

    evalSelection: function(printIt) {
        var str = this.getSelectionOrLineString(),
            result = this.tryBoundEval(str);
        if (printIt) this.insertAtCursor(String(result), true);
        return result;
    },

    evalAll: function() {
        var str = this.textString, result = this.tryBoundEval(str);
        return result;
    },

    doit: function(printResult, editor) {
        var text = this.getSelectionOrLineString(),
            sel = editor.selection,
            result = this.tryBoundEval(text);
        if (printResult) {
            sel && sel.clearSelection();
            var start = sel && sel.getCursor();
            editor.onPaste(String(result));
            var end = start && sel.getCursor();
            if (start && end) {
                sel.moveCursorToPosition(start);
                sel.selectToPosition(end);
            }
            // editor.navigateLeft(result.length);
        } else if (sel && sel.isEmpty()) {
            sel.selectLine();
        }
    },

    doListProtocol: function() {
        var pl = new lively.morphic.Text.ProtocolLister(this);
        // FIXME
        pl.createSubMenuItemFromSignature = function(signature, optStartLetters) {
            var textMorph = this.textMorph, replacer = signature;
            if (typeof(optStartLetters) !== 'undefined') {
                replacer = signature.substring(optStartLetters.size());
            }
            // if (textMorph.getTextString().indexOf('.') < 0) {
            //     replacer = '.' + replacer;
            // }
            return [signature, function() {
                // FIXME not sure if this has to be delayed
                (function() {
                    textMorph.focus();
                    textMorph.insertAtCursor(replacer, true);
                    textMorph.focus();
                }).delay(0)
            }]
        }
        pl.evalSelectionAndOpenListForProtocol();
    },

    getDoitContext: function() { return this.doitContext || this; }

},
'text morph save content interface', {
    hasUnsavedChanges: function() { return this.savedTextString !== this.textString; }
},
'text morph event interface', {
    focus: function() { this.aceEditor.focus(); },
    isFocused: function() { return this._isFocused },
    requestKeyboardFocus: function(hand) { this.focus(); }
},
'text morph selection interface', {
    setSelectionRange: function(startIdx, endIdx) {
        this.withAceDo(function(ed) {
            var doc = ed.session.doc,
                start = doc.indexToPosition(startIdx),
                end = doc.indexToPosition(endIdx)
            ed.selection.setRange({start: start, end: end});
        });
    },

    getSelectionRange: function() {
        return this.withAceDo(function(ed) {
            var range = ed.selection.getRange(),
                doc = ed.session.doc;
            return [doc.positionToIndex(range.start), doc.positionToIndex(range.end)];
        });
    },

    selectAll: function() {
        this.withAceDo(function(ed) { ed.selectAll(); });
    },

    getSelectionOrLineString: function() {
        var editor = this.aceEditor, sel = editor.selection;
        if (!sel) return "";
        var range = sel.isEmpty() ? sel.getLineRange() : editor.getSelectionRange();
        return editor.session.getTextRange(range);
    }

},
'text morph syntax highlighter interface', {
    enableSyntaxHighlighting: function() { this.setTextMode('javascript'); },
    disableSyntaxHighlighting: function() { this.setTextMode('text'); },
    setTextMode: function(modeName) {
        var moduleName = lively.ide.ace.moduleNameForTextMode(modeName),
            editor = this.aceEditor;
        this.loadAceModule(["mode", moduleName], function(mode) {
            var doc = editor.getSession().getDocument(),
                newMode = new mode.Mode(),
                newSession = new ace.EditSession(doc, newMode)
            editor.setSession(newSession);
        });
    }
},
'text morph interface', {

    set textString(string) {
        this.withAceDo(function(ed) {
            ed.selection.clearSelection();
            var pos = ed.getCursorPosition(),
                scroll = ed.session.getScrollTop();
            ed.session.doc.setValue(string);
            ed.selection.moveCursorToPosition(pos);
            ed.session.setScrollTop(scroll);
        });
        return string;
    },

    get textString() {
        return this.withAceDo(function(ed) {
            var doc = ed.getSession().getDocument();
            return doc.getValue();
        }) || "";
    },

    setTextString: function(string) { return this.textString = string; },

    getTextString: function(string) { return this.textString; },

    insertTextStringAt: function(index, string) { throw new Error('implement me'); },
    insertAtCursor: function(string, selectIt, overwriteSelection) {
        this.aceEditor.onPaste(string);
    },

    doSave: function() {
        this.savedTextString = this.textString;
        if (this.evalEnabled) {
            this.tryBoundEval(this.savedTextString);
        }
    },

    doInspect: function() {
        var obj = this.evalSelection();
        if (obj) lively.morphic.inspect(obj);
    },

    setFontSize: function(size) {
        this.getShape().shapeNode.style.fontSize = size + 'pt';
        return this._FontSize = size;
    },

    getFontSize: function() { return this._FontSize; },

    setFontFamily: function(fontName) {
        this.getShape().shapeNode.style.fontFamily = fontName;
        return this._FontFamily = fontName;
    },

    getFontFamily: function() { return this._FontFamily; },

    inputAllowed: function() { return this.allowInput },
    setInputAllowed: function(bool) { throw new Error('implement me'); }

},
'rendering', {
    setClipMode: Functions.Null
});

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// use ace editor as workspace
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

lively.morphic.World.addMethods(
'tools', {
    addCodeEditor: function(options) {
        options = Object.isString(options) ? {content: options} : {}; // convenience
        var bounds = (options.extent || lively.pt(500, 200)).extentAsRectangle(),
            title = options.title || 'Code editor',
            editor = new lively.morphic.CodeEditor(bounds, options.content || ''),
            pane = this.internalAddWindow(editor, options.title, options.position);;
        editor.applyStyle({resizeWidth: true, resizeHeight: true});
        editor.accessibleInInactiveWindow = true;
        editor.focus();
        return pane;
    },

    openWorkspace: function(evt) {
        var window = this.addCodeEditor({
            title: "Workspace",
            content: "nothing",
            syntaxHighlighting: !0
        });
        return window;
    },

    openObjectEditor: function() {
        var objectEditor = this.openPartItem('ObjectEditor', 'PartsBin/Tools'),
            textMorph = objectEditor.get('ObjectEditorScriptPane');
        if (!Config.get('useAceEditor') || textMorph.isAceEditor) return objectEditor;
        // replace the normal text morph of the object editor with a
        // CodeEditor
        var owner = textMorph.owner,
            textString = textMorph.textString,
            bounds = textMorph.bounds(),
            name = textMorph.getName(),
            objectEditorPane = textMorph.objectEditorPane,
            scripts = textMorph.scripts,
            codeMorph = new lively.morphic.CodeEditor(bounds, textString || '');

        lively.bindings.connect(codeMorph, 'textString',
                                owner.get('ChangeIndicator'), 'indicateUnsavedChanges');
        codeMorph.setName(name);
        codeMorph.objectEditorPane = objectEditorPane;
        codeMorph.applyStyle({resizeWidth: true, resizeHeight: true});
        codeMorph.accessibleInInactiveWindow = true;

        Functions.own(textMorph).forEach(function(scriptName) {
            textMorph[scriptName].asScriptOf(codeMorph);
        });

        codeMorph.addScript(function displayStatus(msg, color, delay) {
            if (!this.statusMorph) {
                this.statusMorph = new lively.morphic.Text(pt(100,25).extentAsRectangle());
                this.statusMorph.applyStyle({borderWidth: 1, strokeOpacity: 0, borderColor: Color.gray});
                this.statusMorph.setFill(this.owner.getFill());
                this.statusMorph.setFontSize(11);
                this.statusMorph.setAlign('center');
                this.statusMorph.setVerticalAlign('center');
            }
            this.statusMorph.setTextString(msg);
            this.statusMorph.centerAt(this.innerBounds().center());
            this.statusMorph.setTextColor(color || Color.black);
            this.addMorph(this.statusMorph);
            (function() { this.statusMorph.remove() }).bind(this).delay(delay || 2);
        });

        owner.addMorphBack(codeMorph);
        lively.bindings.disconnectAll(textMorph);
        textMorph.remove();
        owner.reset();
        return objectEditor;
    }
});


// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// ace support for lively.ide
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

lively.morphic.CodeEditor.addMethods(
'deprecated interface', {
    innerMorph: function() { return this },
    showChangeClue: function() {},
    getVerticalScrollPosition: function() { },
    setVerticalScrollPosition: function(value) {}
},
'text compatibility', {
    highlightJavaScriptSyntax: Functions.Null
});

Object.extend(lively.ide, {
    newCodeEditor: function (initialBounds, defaultText) {
        var bounds = initialBounds.extent().extentAsRectangle(),
            text = new lively.morphic.CodeEditor(bounds, defaultText || '');
        text.accessibleInInactiveWindow = true;
        return text;
    }
});

lively.morphic.WindowedApp.subclass('lively.ide.BasicBrowser',
'settings', {
    panelSpec: [
        ['locationPane', newTextPane,                                                        [0,    0,    0.8,  0.03]],
        ['codeBaseDirBtn', function(bnds) { return new lively.morphic.Button(bnds) },        [0.8,  0,    0.12, 0.03]],
        ['localDirBtn', function(bnds) { return new lively.morphic.Button(bnds) },           [0.92, 0,    0.08, 0.03]],
        ['Pane1', newDragnDropListPane,                                                      [0,    0.03, 0.25, 0.37]],
        ['Pane2', newDragnDropListPane,                                                      [0.25, 0.03, 0.25, 0.37]],
        ['Pane3', newDragnDropListPane,                                                      [0.5,  0.03, 0.25, 0.37]],
        ['Pane4', newDragnDropListPane,                                                      [0.75, 0.03, 0.25, 0.37]],
        ['midResizer', function(bnds) { return new lively.morphic.HorizontalDivider(bnds) }, [0,    0.44, 1,    0.01]],
        ['sourcePane', lively.ide.newCodeEditor,                                             [0,    0.45, 1,    0.54]]
    ]
});



}); // end of module
