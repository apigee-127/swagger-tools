/* global describe, it */

/*
 * Copyright 2014 Apigee Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

// Here to quiet down Connect logging errors
process.env.NODE_ENV = 'test';

var _ = require('lodash');
var assert = require('assert');
var middleware = require('../../').middleware.v1_2.swaggerRouter; // jshint ignore:line
var path = require('path');
var request = require('supertest');
var helpers = require('../helpers');
var createServer = helpers.createServer;
var prepareText = helpers.prepareText;


var rlJson = require('../../samples/1.2/resource-listing.json');
var petJson = require('../../samples/1.2/pet.json');
var userJson = require('../../samples/1.2/user.json');
var optionsWithControllersDir = {
  controllers: path.join(__dirname, '..', 'controllers')
};

var testScenarios = {};

_.each(['', '/api/v1'], function (basePath) {
  var clonedRL = _.cloneDeep(rlJson);
  var clonedP = _.cloneDeep(petJson);
  var clonedU = _.cloneDeep(userJson);

  // Add nicknames the router understands for the operations we're testing
  clonedP.apis[0].operations[0].nickname = 'Pets_getById';
  clonedU.apis[0].operations[2].nickname = 'Users_getById';

  // Setup the proper basePath
  switch (basePath) {
  case '':
    delete clonedP.basePath;
    delete clonedU.basePath;

    break;

  case '/api/v1':
    clonedP.basePath = 'http://localhost/api/v1';
    clonedU.basePath = 'http://localhost/api/v1';

    break;
  }

  testScenarios[basePath] = {
    resourceListing: clonedRL,
    apiDeclarations: [
      clonedP,
      clonedU
    ]
  };
});

describe('Swagger Router Middleware v1.2', function () {
  it('should throw Error when passed the wrong arguments', function () {
    var errors = {
      'options.controllers values must be functions': {
        controllers: {
          'Users_getById': 'NotAFunction'
        }
      }
    };
    var controllersPath = path.join(__dirname, '..', 'bad-controllers');
    var usersControllerPath = path.join(controllersPath, 'Users.js');

    // Since we're using a computed key, we have to do it this way
    errors['Controller module expected to export an object: ' + usersControllerPath] = {
      controllers: controllersPath
    };

    _.each(errors, function (args, message) {
      try {
        middleware.apply(middleware, [args]);
        assert.fail(null, null, 'Should had thrown an error');
      } catch (err) {
        assert.equal(message, err.message);
      }
    });
  });

  it('should return a function when passed the right arguments', function () {
    try {
      assert.ok(_.isFunction(middleware()));
    } catch (err) {
      assert.fail(null, null, err.message);
    }
  });

  it('should not do any routing when there are no operations', function () {
    ['', '/api/v1'].forEach(function (basePath) {
      var testResourceList = testScenarios[basePath].resourceListing;
      var testResources = testScenarios[basePath].apiDeclarations;

      request(createServer([testResourceList, testResources], [middleware(optionsWithControllersDir)]))
        .get(basePath + '/foo')
        .expect(200)
        .end(function(err, res) { // jshint ignore:line
          if (err) {
            throw err;
          }
          assert.equal(prepareText(res.text), 'OK');
        });
    });
  });

  it('should do routing when options.controllers is a valid directory path', function () {
    ['', '/api/v1'].forEach(function (basePath) {
      var testResourceList = testScenarios[basePath].resourceListing;
      var testResources = testScenarios[basePath].apiDeclarations;

      request(createServer([testResourceList, testResources], [middleware(optionsWithControllersDir)]))
        .get(basePath + '/user/1')
        .expect(200)
        .end(function(err, res) { // jshint ignore:line
          if (err) {
            throw err;
          }
          assert.equal(prepareText(res.text), require('../controllers/Users').response);
        });
    });
  });

  it('should do routing when options.controllers is a valid controller map', function () {
    var controller = require('../controllers/Users');

    ['', '/api/v1'].forEach(function (basePath) {
      var testResourceList = testScenarios[basePath].resourceListing;
      var testResources = testScenarios[basePath].apiDeclarations;

      request(createServer([testResourceList, testResources], [middleware({
        controllers: {
          'Users_getById': controller.getById
        }
      })]))
        .get(basePath + '/user/1')
        .expect(200)
        .end(function(err, res) { // jshint ignore:line
          if (err) {
            throw err;
          }
          assert.equal(prepareText(res.text), controller.response);
        });
    });
  });

  it('should not do any routing when there is no controller and use of stubs is off', function () {
    ['', '/api/v1'].forEach(function (basePath) {
      var testResourceList = testScenarios[basePath].resourceListing;
      var testResources = testScenarios[basePath].apiDeclarations;

      request(createServer([testResourceList, testResources], [middleware(optionsWithControllersDir)],
              function (req, res) {
                res.end('NOT OK');
              }))
        .get(basePath + '/pet/1')
        .expect(200)
        .end(function(err, res) { // jshint ignore:line
          if (err) {
            throw err;
          }
          assert.equal(prepareText(res.text), 'NOT OK');
        });
    });
  });

  it('should do routing when there is no controller and use of stubs is on', function () {
    var options = _.cloneDeep(optionsWithControllersDir);

    options.useStubs = true;

    ['', '/api/v1'].forEach(function (basePath) {
      var testResourceList = testScenarios[basePath].resourceListing;
      var testResources = testScenarios[basePath].apiDeclarations;

      request(createServer([testResourceList, testResources], [middleware(options)], function (req, res) {
        res.end('NOT OK');
      }))
        .get(basePath + '/pet/1')
        .expect(200)
        .end(function(err, res) { // jshint ignore:line
          if (err) {
            throw err;
          }
          assert.equal(prepareText(res.text), 'Stubbed response for Pets_getById');
        });
    });
  });

  it('should do routing when controller method starts with an underscore', function () {
    ['', '/api/v1'].forEach(function (basePath) {
      var testResourceList = testScenarios[basePath].resourceListing;
      var testResources = _.cloneDeep(testScenarios[basePath].apiDeclarations);

      testResources[1].apis[0].operations[2].nickname = 'Users__getById';

      request(createServer([testResourceList, testResources], [middleware(optionsWithControllersDir)]))
        .get(basePath + '/user/1')
        .expect(200)
        .end(function(err, res) { // jshint ignore:line
          if (err) {
            throw err;
          }
          assert.equal(prepareText(res.text), require('../controllers/Users').response);
        });
    });
  });
});
