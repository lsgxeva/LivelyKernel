module('lively.persistence.tests.StateSync').requires('lively.TestFramework', 'lively.persistence.StateSync').toRun(function() {

AsyncTestCase.subclass('lively.persistence.tests.StateSync.StoreHandle', 
'preparation', {
    setUp: function($super) {
        $super();
        this._store = new lively.persistence.Sync.LocalStore();
        this._root = new lively.persistence.StateSync.StoreHandle(this._store)
    },
    tearDown: function($super) {
        $super();
    },
},
'tests', {
    test01pathAndTreeFunctions: function() {
        var root = this._root,
            c1 = root.child("a");
        var cs = [root, c1, root.child("b"), c1.child("a"), root.child("a.a")];
        this.assert(cs.all(function(ea) { return ea instanceof lively.persistence.StateSync.StoreHandle}),
            "class changed");
        this.assertEquals(cs[0].fullPath().toString(), "", "wrong path");
        this.assertEquals(cs[1].fullPath().toString(), "a", "wrong path 1");
        this.assertEquals(cs[2].fullPath().toString(), "b", "wrong path 2");
        this.assertEquals(cs[3].fullPath().toString(), "a.a", "wrong path 3");
        this.assertEquals(cs[4].fullPath().toString(), "a.a", "wrong path 4");
        this.assertEquals(cs[0], cs[1].parent(), "parent");
        this.assertEquals(cs[0], cs[2].parent(), "parent 1");
        this.assertEquals(cs[1], cs[3].parent(), "parent 2");
        
        this.assertEquals(cs[4].parent().fullPath().toString(), "a", "wrong path 5");
        this.assert(root.isRoot());
        this.assert(root.child("").isRoot())

        this.done()
    },
    test02SettingAndInforming: function() {
        var c = this._root.child("a.a"),
            cc = c.child("a"),
            values = [{value: "123"}, {value: "123", a: 1}], self = this;
        c.overwriteWith({value: "123"});
        c.get(function(err, val) { 
            self.assert(Objects.equal(val, values.shift()));
            if(values.length == 0) self.done()
        })
        cc.set(function(old, newV, cb) { cb(newV) }, function(err, val) { self.assert(val == 1) }, 1)
    },
    test03Updating: function() {
        var c = this._root.child("a.a"),
            cc = c.child("a"),
            values = [],
            updateSupplies = [],
            self = this;
        c.overwriteWith({foo: "123", bar: "234"});
        c.update({foo: "321"}, function(oldV, newV, cb) {
            self.assert(Objects.equal(oldV, {foo: "123"}), "wrong old value");
            self.assert(Objects.equal(newV, {foo: "321"}), "new value not correctly propagated");
            cb(newV)
        }, function(err, curV) {
            self.assert(Objects.equal(curV, {foo: "321"}) 
                    ||  Objects.equal(curV, {foo: "321", bar: "234"}), "new value not saved");
        });
        c.update(null, function(oldV, newV, cb) {
            self.assert(Objects.equal(oldV, {foo: "321", bar: "234"}), "not all values contributed, when none is specified");
            cb(1)
        }, function(err, curV) {
            self.assert(curV == 1, "'number' did not overwrite object");
            self.done()
        })
    },
    test04SettingAndIgnoringCallbacks: function() {
        var c = this._root.child("a"),
            values = [],
            updateSupplies = [],
            self = this;
        c.overwriteWith(2, function() {
            var cb = c.get(function(err, val) {
                values.push(val)
                if (values.length == 3) {
                    self.assertEquals(values[0], 2, "get should be called with the initial value, which was not set, yet");
                    self.assert(values[1] != 4, "this value might be 3 or 5, depending on the scheduling sequence, but not 4");
                    self.assertEquals(values[2], 5, "reported too many values");
                    self.done();
                }
            });
            c.overwriteWith(3, function(err, val) {
                c.overwriteWith(4, function(err, val) {
                    c.overwriteWith(5);
                }, cb)
            });
        })
    },
})

lively.persistence.tests.StateSync.StoreHandle.subclass('lively.persistence.tests.StateSync.L2LHandle', 
'preparation', {
    setUp: function($super) {
        $super();
        // create a new root, to be able to reliably remove all callbacks in tearDown
        this._root = new lively.persistence.StateSync.L2LHandle()
    },
    tearDown: function($super) {
        // lively.persistence.StateSync.L2LHandle.rootHandles = []
        $super();
        lively.persistence.StateSync.L2LHandle.rootHandles = lively.persistence.StateSync.L2LHandle.rootHandles.without(this._root)
    }
,
},
'tests', {
    test01informingSubscribers: function() {
        var root = this._root,
            c1 = root.child("test"),
            self = this;
        self.recordedValues = []
        c1.overwriteWith(0, function(err, value) {
            if (err) self.assert(false)
            self.assertEquals(value, 0)
            
            c1.get(function(err, value) {
                if (err) self.assert(false, "Get: There should be no error when being informed of changes...");
                self.recordedValues.push(value)
                if (self.recordedValues.length == 2) {
                    self.assertEquals(self.recordedValues, [0, 10])
                    self.done()
                }
            });
            c1.overwriteWith(10, function(err, value) { 
                if (err) self.assert(false)
                self.assertEquals(10, value)
            });
        });
    },
    test04SettingAndIgnoringCallbacks: function($super) {
        $super();
    },
})


}) // end of module
