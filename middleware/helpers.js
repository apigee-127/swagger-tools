/*
 * Copyright 2014 Apigee Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*
 * This module contains common methods used in various middleware(s).
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
