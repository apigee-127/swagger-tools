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
var cli = require('../lib/cli');
var StdOutFixture = require('fixture-stdout');
var swagger = require('../');

var errorHandler = module.exports.errorHandler = function errorHandler() {
  return function (err, req, res, next) {
    if (err) {
      if (res.statusCode < 400) {
        res.statusCode = 500;
      }

      // Useful for debugging
      // console.log(err);
      // console.log(err.stack);

      res.end(err.message);

      return next();
    } else {
      return next();
    }
  };
};

module.exports.createServer = function createServer (initArgs, options, callback) {
  var app = require('connect')();
  var serverInit = function (middleware) {
    var handler = options.handler || function (req, res) {
      res.end('OK');
    };

    app.use(middleware.swaggerMetadata());

    // Conditionally enable security (To avoid having to rewrite all Swagger documents or all tests)
    if (Object.keys(options.swaggerSecurityOptions || {}).length > 0) {
      app.use(middleware.swaggerSecurity(options.swaggerSecurityOptions));
    }

    app.use(middleware.swaggerValidator(options.swaggerValidatorOptions));
    app.use(middleware.swaggerRouter(options.swaggerRouterOptions));

    app.use(middleware.swaggerUi(options.swaggerUiOptions));

    app.use(handler);

    // Error handler middleware to pass errors downstream as JSON
    app.use(errorHandler());

    callback(app);
  };

  initArgs.push(serverInit);

  swagger.initializeMiddleware.apply(undefined, initArgs);
};

var prepareText = module.exports.prepareText = function prepareText (text) {
  return text.replace(/&nbsp;/g, ' ').replace(/\n/g, '');
};

module.exports.expectContent = function expectContent (content, done) {
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

module.exports.executeCLI = function executeCLI (args, done) {
  var exitCode = 0;
  var originalExit = process.exit;
  var stderr = '';
  var stderrFixture = new StdOutFixture({stream: process.stderr});
  var stdout = '';
  var stdoutFixture = new StdOutFixture({stream: process.stdout});
  var cliErr;

  // Add Node args
  args.unshift('node', 'swagger-tools');

  // Capture process.stderr
  stderrFixture.capture(function (string) {
    stderr += string;

    // Return 'false' to avoid logging
    return false;
  });

  // Capture process.stdout
  stdoutFixture.capture(function (string) {
    stdout += string;

    // Return 'false' to avoid logging
    return false;
  });

  // Disable process.exit
  process.exit = function (code) {
    exitCode = code || 0;

    throw new Error('Trapped process.exit(' + (code || 0) + ')');
  };

  try {
    cli.execute(args);
  } catch (err) {
    // The nature of trapping process.exit means we can end up with our callbacks being called more than once but this
    // cannot happen in the wild.
    if (err.message.indexOf('Trapped process.exit(') !== -1 &&
        err.message.indexOf('Callback was already called') !== -1) {
      cliErr = err;
    }
  }

  // Wire up original process.stderr, process.stdout and process.exit
  stderrFixture.release();
  stdoutFixture.release();
  process.exit = originalExit;

  if (cliErr) {
    throw cliErr;
  }

  done(stderr, stdout, exitCode);
};
