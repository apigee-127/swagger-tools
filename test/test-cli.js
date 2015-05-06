/* global after, before, describe, it */

/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2015 Apigee Corporation
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
var executeCLI = require('./helpers').executeCLI;
var path = require('path');
var pkg = require('../package.json');
var YAML = require('js-yaml');

var petJsonPath = path.resolve(path.join(__dirname, '..', 'samples', '1.2', 'pet.json'));
var petstoreJsonPath = path.resolve(path.join(__dirname, '..', 'samples', '2.0', 'petstore.json'));
var pkgPath = path.resolve(path.join(__dirname, '..', 'package.json'));
var rlJsonPath = path.resolve(path.join(__dirname, '..', 'samples', '1.2', 'resource-listing.json'));
var storeJsonPath = path.resolve(path.join(__dirname, '..', 'samples', '1.2', 'store.json'));
var userJsonPath = path.resolve(path.join(__dirname, '..', 'samples', '1.2', 'user.json'));

var globalHelp = [
  '',
  '  Usage: swagger-tools [options] [command]',
  '',
  '',
  '  Commands:',
  '',
  '    convert [options] <resourceListing> [apiDeclarations...]               Converts Swagger 1.2 documents to a Swagger 2.0 document',
  '    help [command]                                                         Display help information',
  '    info <version>                                                         Display information about the Swagger version requested',
  '    validate [options] <resourceListingOrSwaggerDoc> [apiDeclarations...]  Display validation results for the Swagger document(s)',
  '',
  '  Options:',
  '',
  '    -h, --help     output usage information',
  '    -V, --version  output the version number',
  '',
  ''
].join('\n');

describe('CLI Global', function () {
  var originalNodeEnv;

  before(function () {
    originalNodeEnv = process.env.NODE_ENV;

    process.env.NODE_ENV = '';
  });

  after(function () {
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('global help', function () {
    it('no arguments', function (done) {
      executeCLI([], function (stderr, stdout) {
        assert.equal(stderr, '');
        assert.equal(stdout, globalHelp);

        done();
      });
    });

    it('help command without argument', function (done) {
      executeCLI(['help'], function (stderr, stdout) {
        assert.equal(stderr, '');
        assert.equal(stdout, globalHelp);

        done();
      });
    });

    it('invalid command', function (done) {
      executeCLI(['fake'], function (stderr, stdout) {
        assert.equal(stderr, '');
        assert.equal(stdout, 'swagger-tools does not support the fake command.\n' + globalHelp);

        done();
      });
    });

    it('--help flag', function (done) {
      executeCLI([], function (stderr, stdout) {
        assert.equal(stderr, '');
        assert.equal(stdout, globalHelp);

        done();
      });
    });
  });

  describe('commands', function () {
    describe('convert', function () {
      it('missing resourceListing argument', function (done) {
        executeCLI(['convert'], function (stderr, stdout) {
          assert.equal(stderr, [
            '',
            '  error: missing required argument `resourceListing\'',
            '',
            ''
          ].join('\n'));
          assert.equal(stdout, '');

          done();
        }); 
      });

      it('invalid resourceListing argument (non-existent file)', function (done) {
        executeCLI(['convert', './fake.json'], function (stderr, stdout) {
          assert.ok([
            // node.js
            [
              '',
              '  error: ENOENT, no such file or directory \'' + (path.join(process.cwd(), 'fake.json')) + '\'',
              '',
              ''
            ].join('\n'),
            // io.js
            [
              '',
              '  error: ENOENT: no such file or directory, open \'' + (path.join(process.cwd(), 'fake.json')) + '\'',
              '',
              ''
            ].join('\n')
          ].indexOf(stderr) > -1);
          assert.equal(stdout, '');

          done();
        });
      });

      it('invalid resourceListing argument (not a Swagger document)', function (done) {
        executeCLI(['convert', pkgPath], function (stderr, stdout) {
          assert.equal(stderr, [
            '',
            '  error: Unable to identify the Swagger version for document: ' + pkgPath,
            '',
            ''
          ].join('\n'));
          assert.equal(stdout, '');

          done();
        });
      });

      it('invalid resourceListing argument (a Swagger 2.0 document)', function (done) {
        executeCLI(['convert', petstoreJsonPath], function (stderr, stdout) {
          assert.equal(stderr, [
            '',
            '  error: Unable to identify the Swagger version for document: ' + petstoreJsonPath,
            '',
            ''
          ].join('\n'));
          assert.equal(stdout, '');

          done();
        });
      });

      it('invalid Swagger document(s)', function (done) {
        executeCLI(['convert', rlJsonPath], function (stderr, stdout) {
          assert.equal(stderr, [
            '',
            'The Swagger document(s) are invalid (Run with --no-validation to skip validation)',
            '',
            'API Errors:',
            '',
            '  #/apis/0/path: Resource path is defined but is not used: /pet',
            '  #/apis/1/path: Resource path is defined but is not used: /user',
            '  #/apis/2/path: Resource path is defined but is not used: /store',
            '',
            'API Warnings:',
            '',
            '  #/authorizations/oauth2: Authorization is defined but is not used: oauth2',
            '  #/authorizations/oauth2/scopes/0: Authorization scope is defined but is not used: write:pets',
            '  #/authorizations/oauth2/scopes/1: Authorization scope is defined but is not used: read:pets',
            '  #/authorizations/oauth2/scopes/2: Authorization scope is defined but is not used: test:anything',
            '',
            '3 errors and 4 warnings',
            '',
            ''
          ].join('\n'));
          assert.equal(stdout, '');

          done();
        });
      });

      it('invalid Swagger document(s) but with validation disabled', function (done) {
        executeCLI(['convert', rlJsonPath, '--no-validation'], function (stderr, stdout) {
          assert.equal(stderr, '');
          assert.ok(_.isPlainObject(JSON.parse(stdout)));

          done();
        });
      });

      it('valid Swagger documents', function (done) {
        executeCLI(['convert', rlJsonPath, petJsonPath, storeJsonPath, userJsonPath], function (stderr, stdout) {
          assert.equal(stderr, '');
          assert.ok(_.isPlainObject(JSON.parse(stdout)));

          done();
        });
      });

      it('valid Swagger documents as YAML', function (done) {
        executeCLI(['convert', '--yaml', rlJsonPath, petJsonPath, storeJsonPath, userJsonPath], function (stderr, stdout) {
          assert.equal(stderr, '');
          assert.ok(_.isPlainObject(YAML.safeLoad(stdout)));

          done();
        });
      });

      it('--help', function (done) {
        executeCLI(['convert', '--help'], function (stderr, stdout) {
          assert.equal(stderr, '');
          assert.equal(stdout, [
            '',
            '  Usage: convert [options] <resourceListing> [apiDeclarations...]',
            '',
            '  Converts Swagger 1.2 documents to a Swagger 2.0 document',
            '',
            '  Options:',
            '',
            '    -h, --help           output usage information',
            '    -n, --no-validation  disable pre-conversion validation of the Swagger document(s)',
            '    -y, --yaml           output as YAML instead of JSON',
            '',
            ''
          ].join('\n'));

          done();
        });
      });      
    });

    describe('help', function () {
      it('convert', function (done) {
        executeCLI(['help', 'convert'], function (stderr, stdout) {
          assert.equal(stderr, '');
          assert.equal(stdout, [
            '',
            '  Usage: convert [options] <resourceListing> [apiDeclarations...]',
            '',
            '  Converts Swagger 1.2 documents to a Swagger 2.0 document',
            '',
            '  Options:',
            '',
            '    -h, --help           output usage information',
            '    -n, --no-validation  disable pre-conversion validation of the Swagger document(s)',
            '    -y, --yaml           output as YAML instead of JSON',
            '',
            ''
          ].join('\n'));

          done();
        });
      });

      it('help', function (done) {
        executeCLI(['help', 'help'], function (stderr, stdout) {
          assert.equal(stderr, '');
          assert.equal(stdout, [
            '',
            '  Usage: help [options] [command]',
            '',
            '  Display help information',
            '',
            '  Options:',
            '',
            '    -h, --help  output usage information',
            '',
            ''
          ].join('\n'));

          done();
        });
      });

      it('info', function (done) {
        executeCLI(['help', 'info'], function (stderr, stdout) {
          assert.equal(stderr, '');
          assert.equal(stdout, [
            '',
            '  Usage: info [options] <version>',
            '',
            '  Display information about the Swagger version requested',
            '',
            '  Options:',
            '',
            '    -h, --help  output usage information',
            '',
            ''
          ].join('\n'));

          done();
        });
      });

      it('validate', function (done) {
        executeCLI(['help', 'validate'], function (stderr, stdout) {
          assert.equal(stderr, '');
          assert.equal(stdout, [
            '',
            '  Usage: validate [options] <resourceListingOrSwaggerDoc> [apiDeclarations...]',
            '',
            '  Display validation results for the Swagger document(s)',
            '',
            '  Options:',
            '',
            '    -h, --help     output usage information',
            '    -v, --verbose  display verbose output',
            '',
            ''
          ].join('\n'));

          done();
        });
      });

      it('--help', function (done) {
        executeCLI(['help', '--help'], function (stderr, stdout) {
          assert.equal(stderr, '');
          assert.equal(stdout, [
            '',
            '  Usage: help [options] [command]',
            '',
            '  Display help information',
            '',
            '  Options:',
            '',
            '    -h, --help  output usage information',
            '',
            ''
          ].join('\n'));

          done();
        });
      });
    });

    describe('info', function () {
      it('missing version argument', function (done) {
        executeCLI(['info'], function (stderr, stdout) {
          assert.equal(stderr, [
            '',
            '  error: missing required argument `version\'',
            '',
            ''
          ].join('\n'));
          assert.equal(stdout, '');

          done();
        }); 
      });

      it('invalid version argument', function (done) {
        executeCLI(['info', 'fake'], function (stderr, stdout) {
          assert.equal(stderr, [
            '',
            '  error: Unsupported Swagger version: fake',
            '',
            ''
          ].join('\n'));
          assert.equal(stdout, '');

          done();
        }); 
      });

      it('Swagger 1.2', function (done) {
        executeCLI(['info', '1.2'], function (stderr, stdout) {
          assert.equal(stderr, '');
          assert.equal(stdout, [
            '',
            'Swagger 1.2 Information:',
            '',
            '  documentation url https://github.com/swagger-api/swagger-spec/blob/master/versions/1.2.md',
            '  schema(s) url     https://github.com/swagger-api/swagger-spec/tree/master/schemas/v1.2',
            '',
            ''
          ].join('\n'));

          done();
        }); 
      });

      it('Swagger 2.0', function (done) {
        executeCLI(['info', '2.0'], function (stderr, stdout) {
          assert.equal(stderr, '');
          assert.equal(stdout, [
            '',
            'Swagger 2.0 Information:',
            '',
            '  documentation url https://github.com/swagger-api/swagger-spec/blob/master/versions/2.0.md',
            '  schema(s) url     https://github.com/swagger-api/swagger-spec/tree/master/schemas/v2.0',
            '',
            ''
          ].join('\n'));

          done();
        }); 
      });

      it('--help', function (done) {
        executeCLI(['info', '--help'], function (stderr, stdout) {
          assert.equal(stderr, '');
          assert.equal(stdout, [
            '',
            '  Usage: info [options] <version>',
            '',
            '  Display information about the Swagger version requested',
            '',
            '  Options:',
            '',
            '    -h, --help  output usage information',
            '',
            ''
          ].join('\n'));

          done();
        });
      });
    });

    describe('validate', function () {
      it('missing resourceListing or swaggerObject argument', function (done) {
        executeCLI(['validate'], function (stderr, stdout) {
          assert.equal(stderr, [
            '',
            '  error: missing required argument `resourceListingOrSwaggerDoc\'',
            '',
            ''
          ].join('\n'));
          assert.equal(stdout, '');

          done();
        }); 
      });

      it('invalid resourceListing or swaggerObject argument (non-existent file)', function (done) {
        executeCLI(['validate', './fake.json'], function (stderr, stdout) {
          assert.ok([
            // node.js
            [
              '',
              '  error: ENOENT, no such file or directory \'' + (path.join(process.cwd(), 'fake.json')) + '\'',
              '',
              ''
            ].join('\n'),
            // io.js
            [
              '',
              '  error: ENOENT: no such file or directory, open \'' + (path.join(process.cwd(), 'fake.json')) + '\'',
              '',
              ''
            ].join('\n')
          ].indexOf(stderr) > -1);
          assert.equal(stdout, '');

          done();
        });
      });

      it('invalid resourceListing or swaggerObject argument (not a Swagger document)', function (done) {
        executeCLI(['validate', pkgPath], function (stderr, stdout) {
          assert.equal(stderr, [
            '',
            '  error: Unable to identify the Swagger version for document: ' + pkgPath,
            '',
            ''
          ].join('\n'));
          assert.equal(stdout, '');

          done();
        });
      });

      describe('Swagger 1.2', function () {
        it('invalid', function (done) {
          executeCLI(['validate', rlJsonPath], function (stderr, stdout) {
            assert.equal(stderr, [
              '',
              'API Errors:',
              '',
              '  #/apis/0/path: Resource path is defined but is not used: /pet',
              '  #/apis/1/path: Resource path is defined but is not used: /user',
              '  #/apis/2/path: Resource path is defined but is not used: /store',
              '',
              'API Warnings:',
              '',
              '  #/authorizations/oauth2: Authorization is defined but is not used: oauth2',
              '  #/authorizations/oauth2/scopes/0: Authorization scope is defined but is not used: write:pets',
              '  #/authorizations/oauth2/scopes/1: Authorization scope is defined but is not used: read:pets',
              '  #/authorizations/oauth2/scopes/2: Authorization scope is defined but is not used: test:anything',
              '',
              '3 errors and 4 warnings',
              '',
              ''
            ].join('\n'));
            assert.equal(stdout, '');

            done();
          });        
        });

        it('invalid (verbose)', function (done) {
          executeCLI(['validate', rlJsonPath, petJsonPath, '--verbose'], function (stderr, stdout) {
            assert.equal(stderr, [
              '',
              'Validation Details:',
              '',
              '  Swagger Version: 1.2',
              '  Swagger files:',
              '',
              '    Resource Listing: ' + rlJsonPath,
              '    API Declarations:',
              '',
              '      ' + petJsonPath,
              '',
              'API Errors:',
              '',
              '  #/apis/1/path: Resource path is defined but is not used: /user',
              '  #/apis/2/path: Resource path is defined but is not used: /store',
              '',
              'API Warnings:',
              '',
              '  #/authorizations/oauth2/scopes/2: Authorization scope is defined but is not used: test:anything',
              '',
              '2 errors and 1 warning',
              '',
              ''
            ].join('\n'));
            assert.equal(stdout, '');

            done();
          });
        });

        it('valid', function (done) {
          executeCLI(['validate', rlJsonPath, petJsonPath, storeJsonPath, userJsonPath], function (stderr, stdout) {
            assert.equal(stderr, '');
            assert.equal(stdout, '');

            done();
          });        
        });

        it('valid (verbose)', function (done) {
          executeCLI(['validate', rlJsonPath, petJsonPath, storeJsonPath, userJsonPath, '--verbose'],
                     function (stderr, stdout) {
                       assert.equal(stderr, '');
                       assert.equal(stdout, [
                         '',
                         'Validation Details:',
                         '',
                         '  Swagger Version: 1.2',
                         '  Swagger files:',
                         '',
                         '    Resource Listing: ' + rlJsonPath,
                         '    API Declarations:',
                         '',
                         '      ' + petJsonPath,
                         '      ' + storeJsonPath,
                         '      ' + userJsonPath,
                         '',
                         'Swagger documents are valid',
                         ''
                       ].join('\n'));

                       done();
                     });
        });
      });

      describe('Swagger 2.0', function () {
        // Testing for invalid documents means writing invalid documents to filesystem and it's not something I want to
        // do right now.

        it('valid', function (done) {
          executeCLI(['validate', petstoreJsonPath], function (stderr, stdout) {
            assert.equal(stderr, '');
            assert.equal(stdout, '');

            done();
          });        
        });

        it('valid (verbose)', function (done) {
          executeCLI(['validate', petstoreJsonPath, '--verbose'],
                     function (stderr, stdout) {
                       assert.equal(stderr, '');
                       assert.equal(stdout, [
                         '',
                         'Validation Details:',
                         '',
                         '  Swagger Version: 2.0',
                         '  Swagger file: ' + petstoreJsonPath,
                         '',
                         'Swagger document is valid',
                         ''
                       ].join('\n'));

                       done();
                     });
        });
      });

      it('--help', function (done) {
        executeCLI(['validate', '--help'], function (stderr, stdout) {
          assert.equal(stderr, '');
          assert.equal(stdout, [
            '',
            '  Usage: validate [options] <resourceListingOrSwaggerDoc> [apiDeclarations...]',
            '',
            '  Display validation results for the Swagger document(s)',
            '',
            '  Options:',
            '',
            '    -h, --help     output usage information',
            '    -v, --verbose  display verbose output',
            '',
            ''
          ].join('\n'));

          done();
        });
      });
    });
  });

  it('--version flag', function (done) {
    executeCLI(['--version'], function (stderr, stdout) {
      assert.equal(stderr, '');
      assert.equal(stdout, pkg.version + '\n');

      done();
    });
  });
});
