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
var fs = require('fs');
var parseurl = require('parseurl');
var path = require('path');

module.exports.handlerCacheFromDir = function handlerCacheFromDir (dir) {
  var handlerCache = {};
  var jsFileRegex = /\.js$/;

  _.each(fs.readdirSync(dir), function (file) {
    var controllerName = file.replace(jsFileRegex, '');
    var controller;

    if (file.match(jsFileRegex)) {
      controller = require(path.resolve(path.join(dir, controllerName)));

      if (!_.isPlainObject(controller)) {
        throw new Error('Controller module expected to export an object: ' + path.join(dir, file));
      }

      _.each(controller, function (value, name) {
        if (_.isFunction(value)) {
          handlerCache[controllerName + '_' + name] = value;
        }
      });
    }
  });

  return handlerCache;
};

module.exports.createStubHandler = function createStubHandler (req, res, msg) {
  return function stubHandler (req, res) {
    res.end(msg);
  };
};

module.exports.expressStylePath = function expressStylePath (basePath, apiPath) {
  basePath = parseurl({url: basePath || '/'}).pathname || '/';

  // Make sure the base path starts with '/'
  if (basePath.charAt(0) !== '/') {
    basePath = '/' + basePath;
  }

  // Make sure the base path ends with '/'
  if (basePath.charAt(basePath.length - 1) !== '/') {
    basePath = basePath + '/';
  }

  // Make sure the api path does not start with '/' since the base path will end with '/'
  if (apiPath.charAt(0) === '/') {
    apiPath = apiPath.substring(1);
  }

  // Replace Swagger syntax for path parameters with Express' version (All Swagger path parameters are required)
  return (basePath + apiPath).replace(/{/g, ':').replace(/}/g, '');
};
