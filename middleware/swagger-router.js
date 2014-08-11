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

'use strict';

var _ = require('lodash');
var fs = require('fs');
var path = require('path');

var defaultOptions = {
  controllers: {},
  useStubs: false // Should we set this automatically based on process.env.NODE_ENV?
};

var handlerCacheFromDir = function handlerCacheFromDir (dir) {
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

var createStubHandler = function createStubHandler (req, res, msg) {
  return function stubHandler (req, res) {
    res.end(msg);
  };
};

/**
 * Middleware for using Swagger information to route requests to handlers.
 *
 * This middleware also requires that you use the swagger-metadata middleware before this middleware.  This middleware
 * also makes no attempt to work around invalid Swagger documents.  If you would like to validate your requests using
 * the swagger-validator middleware, you must use it prior to using this middleware.
 *
 * The routing works such that any Swagger operation is expected to have a nickname like this:
 * {ControllerName}_{methodName}.  We will then identify the controller by name from the controllers path (configurable)
 * and identify the route handler within the controller by name.
 *
 * @param {object} [options] - The middleware options
 *
 * @returns the middleware function
 */
exports = module.exports = function swaggerRouterMiddleware (options) {
  var handlerCache = {};

  // Set the defaults
  options = _.defaults(options || {}, defaultOptions);

  if (_.isPlainObject(options.controllers)) {
    // Create the handler cache from the passed in controllers object
    _.each(options.controllers, function (func) {
      if (!_.isFunction(func)) {
        throw new Error('options.controllers values must be functions');
      }
    });

    handlerCache = options.controllers;
  } else {
    // Create the handler cache from the modules in the controllers directory
    handlerCache = handlerCacheFromDir(options.controllers);
  }

  return function swaggerRouter (req, res, next) {
    var operation = req.swagger ? req.swagger.operation : undefined;
    var handler;

    if (!_.isUndefined(operation)) {
      handler = handlerCache[operation.nickname];

      if (_.isUndefined(handler) && options.useStubs === true) {
        handler = handlerCache[operation.nickname] = createStubHandler(req, res,
                                                                       'Stubbed response for ' + operation.nickname);
      }

      if (!_.isUndefined(handler)) {
        return handler(req, res, next);
      }
    }

    return next();
  };
};
