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
var helpers = require('../helpers');
var middleware = require('../../').middleware.v2_0.swaggerRouter; // jshint ignore:line
var petStoreJson = require('../../samples/2.0/petstore.json');
var path = require('path');
var request = require('supertest');

var createServer = helpers.createServer;
var optionsWithControllersDir = {
  controllers: path.join(__dirname, '..', 'controllers')
};
var prepareText = helpers.prepareText;
var testScenarios = {};

_.each(['', '/api/v1'], function (basePath) {
  var clonedP = _.cloneDeep(petStoreJson);

  // Add nicknames the router understands for the operations we're testing
  clonedP.paths['/pets']['x-swagger-router-controller'] = 'Pets';
  clonedP.paths['/pets/{id}'].get['x-swagger-router-controller'] = 'Pets';
  clonedP.paths['/pets/{id}'].delete['x-swagger-router-controller'] = 'Pets';

  // Setup the proper basePath
  switch (basePath) {
  case '':
    delete clonedP.basePath;

    break;

  case '/api/v1':
    clonedP.basePath = 'http://localhost/api/v1';

    break;
  }

  testScenarios[basePath] = clonedP;
});

describe('Swagger Router Middleware v2.0', function () {
  it('should throw Error when passed the wrong arguments', function () {
    var errors = {
      'options.controllers values must be functions': {
        controllers: {
          'Pets_getPetById': 'NotAFunction'
        }
      }
    };
    var controllersPath = path.join(__dirname, '..', 'bad-controllers');
    var badController = path.join(controllersPath, 'Users.js');

    // Since we're using a computed key, we have to do it this way
    errors['Controller module expected to export an object: ' + badController] = {
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
      request(createServer([testScenarios[basePath]], [middleware(optionsWithControllersDir)]))
        .get(basePath + '/foo')
        .expect(200)
        .end(function(err, res) { // jshint ignore:line
          if (err) {
            console.log(res.text);
            throw err;
          }
          assert.equal(prepareText(res.text), 'OK');
        });
    });
  });

  it('should do routing when options.controllers is a valid directory path', function () {
    ['', '/api/v1'].forEach(function (basePath) {
      request(createServer([testScenarios[basePath]], [middleware(optionsWithControllersDir)]))
        .get(basePath + '/pets/1')
        .expect(200)
        .end(function(err, res) { // jshint ignore:line
          if (err) {
            throw err;
          }
          assert.equal(prepareText(res.text), require('../controllers/Pets').response);
        });
    });
  });

  it('should do routing when options.controllers is a valid controller map', function () {
    var controller = require('../controllers/Pets');

    ['', '/api/v1'].forEach(function (basePath) {
      request(createServer([testScenarios[basePath]], [middleware({
        controllers: {
          'Pets_getPetById': controller.getPetById
        }
      })]))
        .get(basePath + '/pets/1')
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
      var swaggerObject = _.cloneDeep(testScenarios[basePath]);

      swaggerObject.paths['/pets/{id}'].get['x-swagger-router-controller'] = 'PetsAdmin';

      request(createServer([swaggerObject], [middleware(optionsWithControllersDir)],
              function (req, res) {
                res.end('NOT OK');
              }))
        .get(basePath + '/pets/1')
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
      var swaggerObject = _.cloneDeep(testScenarios[basePath]);

      swaggerObject.paths['/pets/{id}'].get['x-swagger-router-controller'] = 'PetsAdmin';

      request(createServer([swaggerObject], [middleware(options)], function (req, res) {
        res.end('NOT OK');
      }))
        .get(basePath + '/pets/1')
        .expect(200)
        .end(function(err, res) { // jshint ignore:line
          if (err) {
            throw err;
          }
          assert.equal(prepareText(res.text), 'Stubbed response for PetsAdmin_getPetById');
        });
    });
  });

  it('should do routing when controller method starts with an underscore', function () {
    ['', '/api/v1'].forEach(function (basePath) {
      var swaggerObject = testScenarios[basePath];

      swaggerObject.paths['/pets'].get.operationId = '_getAllPets';

      request(createServer([swaggerObject], [middleware(optionsWithControllersDir)]))
        .get(basePath + '/pets')
        .expect(200)
        .end(function(err, res) { // jshint ignore:line
          if (err) {
            throw err;
          }
          assert.equal(prepareText(res.text), require('../controllers/Pets').response);
        });
    });
  });

  it('should do routing when controller is provided but operationId is missing', function () {
    ['', '/api/v1'].forEach(function (basePath) {
      var swaggerObject = testScenarios[basePath];

      delete swaggerObject.paths['/pets/{id}'].delete.operationId;

      request(createServer([swaggerObject], [middleware(optionsWithControllersDir)]))
        .delete(basePath + '/pets/1')
        .expect(204)
        .end(function(err, res) { // jshint ignore:line
          if (err) {
            throw err;
          }
          assert.equal(prepareText(res.text), '');
        });
    });
  });
});
