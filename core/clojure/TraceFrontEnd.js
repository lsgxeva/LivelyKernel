module('clojure.TraceFrontEnd').requires('clojure.SystemNotifier').toRun(function() {

// Using the rksm.cloxp-trace clojure package

Object.extend(clojure.TraceFrontEnd, {
  
  state: clojure.TraceFrontEnd.state || {lastUpdate: 0, updateTimeout: 2000, captureUpdateProc: null},
  
  ensureUpdateProc: function() {
    // clojure.Runtime.evalQueue
    // clojure.TraceFrontEnd.state
    // clojure.TraceFrontEnd.ensureUpdateProc();
    // clojure.TraceFrontEnd.stopUpdateProc();
    var self = this;
    if (self.state.captureUpdateProc || (Date.now() - self.state.lastUpdate < 1000*60)) return;
    self.state.captureUpdateProc = setTimeout(function() {
      self.retrieveCapturesAndInformEditors({}, function(err, captures) {
        delete self.state.captureUpdateProc;
        if (err) show("Error in retrieveCaptures: \n" + err)
        if (!err && captures.length) self.ensureUpdateProc();
      });
    }, self.state.updateTimeout);
  },

  stopUpdateProc: function() {
    if (this.state.captureUpdateProc) {
      clearTimeout(this.state.captureUpdateProc);
      delete this.state.captureUpdateProc;
    }
  },

  updateEarly: function(force) {
    var self = this;
    if (!force && !self.state.captureUpdateProc) return;
    lively.lang.fun.debounceNamed("clojure.TraceFrontEndUpdateCapture", 300, function() {
      self.retrieveCapturesAndInformEditors({});
    })();
  },

  createCaptureOverview: function(thenDo) {
    clojure.TraceFrontEnd.ensureUpdateProc();
    var ed = $morph(/clojure-captures/) || $world.addActionText(
      [],
      {title: "active captures", name: "clojure-captures"});

    ed.setInputAllowed(false);
    ed.addScript(function onClojureCaptureStateUpdate(captures) {
      this.captures = captures;
      this.update();
    });
    ed.addScript(function update(err) {
      if (err) { this.setAttributedText([["Error: " + err]]); return; }

      var self = this;
      var attr = [
        ["[uninstall all]", {type: 'action', onClick: uninstall.curry(self.captures.pluck("id"))}],
        ["\n"]
      ].concat(this.captures.reduce(function(attr, c) {
        var n = c.ns + "/" + c.name;
        var val = (c['last-val'] || "no value").truncate(60);
        return attr.concat([
          ["[x]", {type: 'action', onClick: uninstall.curry([c.id])}],
          ["[∅]", {type: 'action', onClick: empty.curry([c.id])}],
          ["[show] ", {type: 'action', capture: c, onClick: inspect.curry(c.id)}],
          [n + ": " + val + " "],
          ["\n"]]);
      }, []));
      this.setAttributedText(attr);
      function uninstall(ids) {
        lively.lang.arr.mapAsyncSeries(ids,
          function(ea, _, n) { clojure.TraceFrontEnd.uninstallCapture(ea, n); },
          function(err) {
            self.setStatusMessage(err ? "Error uninstalling capture" + err.stack :
              "Uninstalled " + ids.join(", ")); });
      }
      function empty(id) {
        clojure.TraceFrontEnd.emptyCapture(id, function(err) {
            self.setStatusMessage(err ? "Error emptying capture" + err.stack : "Emptied " + id); });
      }
    
      function inspect(id) {
        var cmd = lively.ide.codeeditor.modes.Clojure.commands.detect(function(ea) {
          return ea.name === "clojureCaptureInspectOne"; })
        cmd.exec(self.aceEditor, {id: id, all: true});
      }
    });
    return ed;


  },
  
  retrieveCapturesAndInformEditors: function(options, thenDo) {
    lively.lang.fun.composeAsync(
      this.retrieveCaptures.bind(this, options),
      function(captures, n) {
        clojure.SystemNotifier.informCodeEditorsAboutCapturedState(captures);
        n(null, captures);
      }
    )(thenDo);
  },

  retrieveCaptures: function(options, thenDo) {
    options = options || {};
    clojure.Runtime.doEval(
      lively.lang.string.format("(rksm.cloxp-trace/captures->json :nss %s)",
        options.namespaces ? lively.lang.string.print(options.namespaces) : ":all"),
      {resultIsJSON: true, passError: true}, thenDo);
  },

  inspectCapturesValuesWithId: function(options, thenDo) {
    var code = lively.lang.string.format('(-> (rksm.cloxp-trace/captures) (get "%s") %s)',
      options.id, options.all ? "" : "first");
    clojure.Runtime.doEval(code, {prettyPrint: true}, thenDo)
  },

  uninstallCapture: function(id, thenDo) {
    var self = this;
    clojure.Runtime.doEval(
      lively.lang.string.format("(rksm.cloxp-trace/uninstall-capture! \"%s\")", id),
      {resultIsJSON: false, passError: true}, function(err) {
        self. updateEarly(true);
        thenDo && thenDo(err);
      });
  },

  emptyCapture: function(id, thenDo) {
    var self = this;
    clojure.Runtime.doEval(
      lively.lang.string.format("(rksm.cloxp-trace/empty-capture! \"%s\")",
        id),
      {resultIsJSON: false, passError: true}, function(err) {
        self. updateEarly(true);
        thenDo && thenDo(err);
      });
  },

  astIdxToSourceIdx: function(node, i) {
    // 3. Find the ast index (linear, prewalk enumeration) of targetNode
    var idx = 0;
    var found = lively.lang.tree.detect(node,
      function(n) { if (idx === i) return true; idx++; return false; },
      function(n) {
        // ignore [] and {} for now
        return n.type === 'list' && ['(', '[', '{'].include(n.open) && n.children;
      });
    return found ? found.start : undefined;
  },
  
  findSelectedNode: function(ast, pos, endPos) {
    // given a start and end position in the source used to produce ast, find
    // the s-expression that is selected (contained by the range) of start and end
    // pos

    // 1. Find the parent list
    var parents = paredit.walk.containingSexpsAt(ast, pos);
    var parent = parents.last();

    if (!parent) return undefined;
    // 2. Find the child node right of pos
    var targetNode = parent.children.detect(function(ea) { return pos <= ea.start; });
    if (!targetNode || (endPos !== undefined) && endPos < targetNode.end) return undefined;
    
    if (parent.type === "toplevel") return {idx: 0, node: targetNode, topLevelNode: parent};

    // 3. Find the ast index (linear, prewalk enumeration) of targetNode
    var idx = 0;
    var found = lively.lang.tree.detect(ast.type === "toplevel" ? parents[1] : ast,
      function(n) { idx++; return targetNode === n; },
      function(n) {
        // ignore [] and {} for now
        return n.type === 'list' && ['(', '[', '{'].include(n.open) && n.children;
      });
    return found ? {idx: idx-1, node: targetNode, topLevelNode: ast.type === "toplevel" ? parents[1] : ast} : undefined;
  },

  printEnumeratedNodes: function(ast, src) {
    var idx = 0;
    return lively.lang.tree.map(ast,
      function(n) { idx++; return (idx-1) + ": " + src.slice(n.start,n.end); },
      function(n) {
        // ignore [] and {} for now
        return n.type === 'list' && ['(', '[', '{'].include(n.open) && n.children;
      });
  },

  installTraceCode: function(ast, src, pos, posEnd) {
    var sel = this.findSelectedNode(ast, pos, posEnd);
    if (!sel) return null;
    return lively.lang.obj.merge(sel, {
      topLevelSource: src.slice(sel.topLevelNode.start, sel.topLevelNode.end),
      annotatedSource: src.slice(sel.topLevelNode.start, sel.node.start) + "->" + src.slice(sel.node.start, sel.topLevelNode.end)
    });
  }

});


}) // end of module
