/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Apigee Corporation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

'use strict';

var _ = require('lodash');
var assert = require('assert');
var swagger = require('../');

var errorHandler = module.exports.errorHandler = function errorHandler() {
  return function (err, req, res, next) {
    if (err) {
      if (res.statusCode < 400) {
        res.statusCode = 500;
      }

      res.end(err.message);
    } else {
      return next();
    }
  };
};

module.exports.createServer = function createServer (middlewareArgs, middlewares, handler) {
  var swaggerMetadata;
  var app = require('connect')();
  var bodyParser = require('body-parser');
  var parseurl = require('parseurl');
  var qs = require('qs');

  switch (middlewareArgs.length) {
  case 2:
    swaggerMetadata = swagger.middleware.v1_2.swaggerMetadata; // jshint ignore:line
    break;

  case 1:
    swaggerMetadata = swagger.middleware.v2_0.swaggerMetadata; // jshint ignore:line
    break;
  }

  // Required middleware
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(function (req, res, next) {
    if (!req.query) {
      req.query = req.url.indexOf('?') > -1 ? qs.parse(parseurl(req).query, {}) : {};
    }

    return next();
  });

  app.use(swaggerMetadata.apply(swaggerMetadata, middlewareArgs));

  _.each(middlewares || [], function (middleware) {
    app.use(middleware);
  });

  if (handler) {
    app.use(handler);
  } else {
    app.use(function(req, res){
      res.end('OK');
    });
  }

  // Error handler middleware to pass errors downstream as JSON
  app.use(errorHandler());

  return app;
};

var prepareText = module.exports.prepareText = function prepareText (text) {
  return text.replace(/&nbsp;/g, ' ').replace(/\n/g, '');
};

module.exports.expectContent = function expectContent (content) {
  return function (err, res) {
    if (err) {
      throw err;
    }

    if (_.isPlainObject(content)) {
      assert.deepEqual(JSON.parse(prepareText(res.text)), content);
    } else {
      assert.equal(prepareText(res.text), content);
    }
  };
};
