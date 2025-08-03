"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/debug.ts
var express_1 = require("express");
var app = (0, express_1.default)();
app.get("/", function (req, res) {
    console.log("✅ Request:", req.auth);
    res.send("Works!");
});
app.listen(3000, function () { return console.log("✅ Debug server on 3000"); });
