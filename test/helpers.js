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

var _ = require('lodash-compat');
var assert = require('assert');
var cp = require('child_process');
var path = require('path');
var swagger = require('../');

var errorHandler = module.exports.errorHandler = function () {
  return function (err, req, res, next) {
    var resp = {};

    if (err) {
      if (res.statusCode < 400) {
        res.statusCode = 500;
      }

      // Useful for debugging
      // console.log(err);
      // console.log(err.stack);

      // if (err.results) {
      //   console.log(JSON.stringify(err.results, null, 2));
      // }

      if (req.headers.accept && req.headers.accept.indexOf('application/json') > -1) {
        res.setHeader('Content-Type', 'application-json');

        _.each(err, function (val, key) {
          resp[key] = val;
        });

        resp.message = err.message;

        resp = JSON.stringify(resp);
      } else {
        resp = err.message;
      }

      res.end(resp);

      return next();
    } else {
      return next();
    }
  };
};

module.exports.createServer = function (initArgs, options, callback) {
  var app = require('connect')();
  var serverInit = function (middleware) {
    var handler = options.handler || function (req, res) {
      res.end('OK');
    };

    function register (middleware) {
      if (_.isUndefined(options.mountPoint)) {
        app.use(middleware);
      } else {
        app.use(options.mountPoint, middleware);
      }
    }

    // For testing only can the callback be called with an Error
    if (_.isError(middleware)) {
      throw middleware;
    }

    if (options.middlewares) {
      options.middlewares.forEach(function (middleware) {
        register(middleware);
      });
    }

    register(middleware.swaggerMetadata());

    // Conditionally enable security (To avoid having to rewrite all Swagger documents or all tests)
    if (Object.keys(options.swaggerSecurityOptions || {}).length > 0) {
      register(middleware.swaggerSecurity(options.swaggerSecurityOptions));
    }

    register(middleware.swaggerValidator(options.swaggerValidatorOptions));
    register(middleware.swaggerRouter(options.swaggerRouterOptions));
    register(middleware.swaggerUi(options.swaggerUiOptions));

    register(handler);

    // Error handler middleware to pass errors downstream
    app.use(errorHandler());

    callback(app);
  };

  initArgs.push(serverInit);

  swagger.initializeMiddleware.apply(undefined, initArgs);
};

var prepareText = module.exports.prepareText = function (text) {
  return text.replace(/&nbsp;/g, ' ').replace(/\n/g, '');
};

module.exports.expectContent = function (content, done) {
  return function (err, res) {
    if (err) {
      throw err;
    }

    if (_.isArray(content) || _.isPlainObject(content)) {
      assert.deepEqual(JSON.parse(prepareText(res.text)), content);
    } else {
      assert.equal(prepareText(res.text), content);
    }

    if (_.isFunction(done)) {
      done();
    }
  };
};

module.exports.executeCLI = function (args, done) {
  // Add Node args
  args.unshift('node', path.resolve(path.join(__dirname, '..', 'bin', 'swagger-tools')));
  var options = {
    env: _.assign({}, process.env, {
      RUNNING_SWAGGER_TOOLS_TESTS: true
    })
  };
  cp.exec(args.join(' '),  options, function (err, stdout, stderr) {
    done(stderr, stdout);
  });
};
