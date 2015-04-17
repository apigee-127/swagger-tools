!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var o;"undefined"!=typeof window?o=window:"undefined"!=typeof global?o=global:"undefined"!=typeof self&&(o=self),(o.SwaggerTools||(o.SwaggerTools={})).specs=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
"use strict";var _=require("lodash"),async=require("async"),helpers=require("./helpers"),JsonRefs=require("json-refs"),SparkMD5=require("spark-md5"),swaggerConverter=require("swagger-converter"),traverse=require("traverse"),validators=require("./validators");_.isPlainObject(swaggerConverter)&&(swaggerConverter=global.SwaggerConverter.convert);var documentCache={},validOptionNames=_.map(helpers.swaggerOperationMethods,function(e){return e.toLowerCase()}),addExternalRefsToValidator=function e(r,n,i){var t=_.reduce(JsonRefs.findRefs(n),function(e,r,n){return JsonRefs.isRemotePointer(n)&&e.push(r.split("#")[0]),e},[]),o=function(n,i){JsonRefs.resolveRefs({$ref:n},function(n,t){return n?i(n):void e(r,t,function(e,r){i(e,r)})})};t.length>0?async.map(t,o,function(e,n){return e?i(e):(_.each(n,function(e,n){r.setRemoteReference(t[n],e)}),void i())}):i()},createErrorOrWarning=function(e,r,n,i){i.push({code:e,message:r,path:n})},addReference=function(e,r,n,i,t){var o,a,s,c,d,u=!0,f=helpers.getSwaggerVersion(e.resolved),h=_.isArray(r)?r:JsonRefs.pathFromPointer(r),p=_.isArray(r)?JsonRefs.pathToPointer(r):r,l=_.isArray(n)?n:JsonRefs.pathFromPointer(n),g=_.isArray(n)?JsonRefs.pathToPointer(n):n;return 0===h.length?(createErrorOrWarning("INVALID_REFERENCE","Not a valid JSON Reference",l,i.errors),!1):(a=e.definitions[p],d=h[0],o="securityDefinitions"===d?"SECURITY_DEFINITION":d.substring(0,d.length-1).toUpperCase(),s="1.2"===f?h[h.length-1]:p,c="securityDefinitions"===d?"Security definition":o.charAt(0)+o.substring(1).toLowerCase(),["authorizations","securityDefinitions"].indexOf(h[0])>-1&&"scopes"===h[2]&&(o+="_SCOPE",c+=" scope"),_.isUndefined(a)?(t||createErrorOrWarning("UNRESOLVABLE_"+o,c+" could not be resolved: "+s,l,i.errors),u=!1):(_.isUndefined(a.references)&&(a.references=[]),a.references.push(g)),u)},getOrComposeSchema=function r(e,n){var i,t,o="Composed "+("1.2"===e.swaggerVersion?JsonRefs.pathFromPointer(n).pop():n),a=e.definitions[n],s=traverse(e.original),c=traverse(e.resolved);return a?(t=_.cloneDeep(s.get(JsonRefs.pathFromPointer(n))),i=_.cloneDeep(c.get(JsonRefs.pathFromPointer(n))),"1.2"===e.swaggerVersion&&(a.lineage.length>0&&(i.allOf=[],_.each(a.lineage,function(n){i.allOf.push(r(e,n))})),delete i.subTypes,_.each(i.properties,function(n,i){var o=t.properties[i];_.each(["maximum","minimum"],function(e){_.isString(n[e])&&(n[e]=parseFloat(n[e]))}),_.each(JsonRefs.findRefs(o),function(i,t){var o="#/models/"+i,a=e.definitions[o],s=JsonRefs.pathFromPointer(t);a.lineage.length>0?traverse(n).set(s.slice(0,s.length-1),r(e,o)):traverse(n).set(s.slice(0,s.length-1).concat("title"),"Composed "+i)})})),i=traverse(i).map(function(e){"id"===this.key&&_.isString(e)&&this.remove()}),i.title=o,i):void 0},createUnusedErrorOrWarning=function(e,r,n,i,t){createErrorOrWarning("UNUSED_"+r,n+" is defined but is not used: "+e,i,t)},getDocumentCache=function(e){var r=SparkMD5.hash(JSON.stringify(e)),n=documentCache[r]||_.find(documentCache,function(e){return e.resolvedId===r});return n||(n=documentCache[r]={definitions:{},original:e,resolved:void 0,swaggerVersion:helpers.getSwaggerVersion(e)}),n},handleValidationError=function(e,r){var n=new Error("The Swagger document(s) are invalid");n.errors=e.errors,n.failedValidation=!0,n.warnings=e.warnings,e.apiDeclarations&&(n.apiDeclarations=e.apiDeclarations),r(n)},normalizePath=function(e){var r=e.match(/\{(.*?)\}/g),n=[],i=e;return r&&_.each(r,function(e,r){i=i.replace(e,"{"+r+"}"),n.push(e.replace(/[{}]/g,""))}),{path:i,args:n}},validateNoExist=function(e,r,n,i,t,o){!_.isUndefined(e)&&e.indexOf(r)>-1&&createErrorOrWarning("DUPLICATE_"+n,i+" already defined: "+r,t,o)},validateSchemaConstraints=function(e,r,n,i,t){try{validators.validateSchemaConstraints(e.swaggerVersion,r,n,void 0)}catch(o){t||createErrorOrWarning(o.code,o.message,o.path,i.errors)}},processDocument=function(e,r){var n=e.swaggerVersion,i=function(r,n){var i=JsonRefs.pathToPointer(r),t=e.definitions[i];return t||(t=e.definitions[i]={inline:n||!1,references:[]},["definitions","models"].indexOf(JsonRefs.pathFromPointer(i)[0])>-1&&(t.cyclical=!1,t.lineage=void 0,t.parents=[])),t},t=function(e){return"1.2"===n?JsonRefs.pathFromPointer(e).pop():e},o=function c(r,n,i){var t=e.definitions[n||r];t&&_.each(t.parents,function(e){i.push(e),r!==e&&c(r,e,i)})},a="1.2"===n?"authorizations":"securityDefinitions",s="1.2"===n?"models":"definitions";switch(_.each(e.resolved[a],function(e,t){var o=[a,t];("1.2"!==n||e.type)&&(i(o),_.reduce(e.scopes,function(e,t,a){var s="1.2"===n?t.scope:a,c=o.concat(["scopes",a.toString()]),d=i(o.concat(["scopes",s]));return d.scopePath=c,validateNoExist(e,s,"AUTHORIZATION_SCOPE_DEFINITION","Authorization scope definition","1.2"===n?c.concat("scope"):c,r.warnings),e.push(s),e},[]))}),_.each(e.resolved[s],function(t,o){var a=[s,o],c=i(a);if("1.2"===n&&o!==t.id&&createErrorOrWarning("MODEL_ID_MISMATCH","Model id does not match id in models object: "+t.id,a.concat("id"),r.errors),_.isUndefined(c.lineage))switch(n){case"1.2":_.each(t.subTypes,function(n,t){var o=["models",n],c=JsonRefs.pathToPointer(o),d=e.definitions[c],u=a.concat(["subTypes",t.toString()]);!d&&e.resolved[s][n]&&(d=i(o)),addReference(e,o,u,r)&&d.parents.push(JsonRefs.pathToPointer(a))});break;default:_.each(e.original[s][o].allOf,function(r,n){var t,o=!1;_.isUndefined(r.$ref)||JsonRefs.isRemotePointer(r.$ref)?(o=!0,t=a.concat(["allOf",n.toString()])):t=JsonRefs.pathFromPointer(r.$ref),_.isUndefined(traverse(e.resolved).get(t))||(i(t,o),c.parents.push(JsonRefs.pathToPointer(t)))})}}),n){case"2.0":_.each(e.resolved.parameters,function(n,t){var o=["parameters",t];i(o),validateSchemaConstraints(e,n,o,r)}),_.each(e.resolved.responses,function(n,t){var o=["responses",t];i(o),validateSchemaConstraints(e,n,o,r)})}_.each(e.definitions,function(i,a){var s,c,d,u=JsonRefs.pathFromPointer(a),f=traverse(e.original).get(u),h=u[0],p=h.substring(0,h.length-1).toUpperCase(),l=p.charAt(0)+p.substring(1).toLowerCase();-1!==["definitions","models"].indexOf(h)&&(s=[],c=[],d=i.lineage,_.isUndefined(d)&&(d=[],o(a,void 0,d),d.reverse(),i.lineage=_.cloneDeep(d),i.cyclical=d.length>1&&d[0]===a),i.parents.length>1&&"1.2"===n&&createErrorOrWarning("MULTIPLE_"+p+"_INHERITANCE","Child "+p.toLowerCase()+" is sub type of multiple models: "+_.map(i.parents,function(e){return t(e)}).join(" && "),u,r.errors),i.cyclical&&createErrorOrWarning("CYCLICAL_"+p+"_INHERITANCE",l+" has a circular inheritance: "+_.map(d,function(e){return t(e)}).join(" -> ")+" -> "+t(a),u.concat("1.2"===n?"subTypes":"allOf"),r.errors),_.each(d.slice(i.cyclical?1:0),function(r){var n=traverse(e.resolved).get(JsonRefs.pathFromPointer(r));_.each(Object.keys(n.properties||{}),function(e){-1===c.indexOf(e)&&c.push(e)})}),validateSchemaConstraints(e,f,u,r),_.each(f.properties,function(n,i){var t=u.concat(["properties",i]);_.isUndefined(n)||(validateSchemaConstraints(e,n,t,r),c.indexOf(i)>-1?createErrorOrWarning("CHILD_"+p+"_REDECLARES_PROPERTY","Child "+p.toLowerCase()+" declares property already declared by ancestor: "+i,t,r.errors):s.push(i))}),_.each(f.required||[],function(e,i){var t="1.2"===n?"Model":"Definition";-1===c.indexOf(e)&&-1===s.indexOf(e)&&createErrorOrWarning("MISSING_REQUIRED_"+t.toUpperCase()+"_PROPERTY",t+" requires property but it is not defined: "+e,u.concat(["required",i.toString()]),r.errors)}))}),_.each(JsonRefs.findRefs(e.original),function(n,i){"1.2"===e.swaggerVersion&&(n="#/models/"+n),JsonRefs.isRemotePointer(n)||addReference(e,n,i,r)})},validateExist=function(e,r,n,i,t,o){_.isUndefined(e)||-1!==e.indexOf(r)||createErrorOrWarning("UNRESOLVABLE_"+n,i+" could not be resolved: "+r,t,o)},processAuthRefs=function(e,r,n,i){var t="1.2"===e.swaggerVersion?"AUTHORIZATION":"SECURITY_DEFINITION",o="AUTHORIZATION"===t?"Authorization":"Security definition";"1.2"===e.swaggerVersion?_.reduce(r,function(r,a,s){var c=["authorizations",s],d=n.concat([s]);return addReference(e,c,d,i)&&_.reduce(a,function(r,n,a){var s=d.concat(a.toString(),"scope"),u=c.concat(["scopes",n.scope]);return validateNoExist(r,n.scope,t+"_SCOPE_REFERENCE",o+" scope reference",s,i.warnings),addReference(e,u,s,i),r.concat(n.scope)},[]),r.concat(s)},[]):_.reduce(r,function(r,a,s){return _.each(a,function(a,c){var d=["securityDefinitions",c],u=n.concat(s.toString(),c);validateNoExist(r,c,t+"_REFERENCE",o+" reference",u,i.warnings),r.push(c),addReference(e,d,u,i)&&_.each(a,function(r,n){var t=d.concat(["scopes",r]);addReference(e,t,u.concat(n.toString()),i)})}),r},[])},resolveRefs=function(e,r){var n,i=getDocumentCache(e),t=helpers.getSwaggerVersion(e);i.resolved?r():("1.2"===t&&(e=_.cloneDeep(e),n=traverse(e),_.each(JsonRefs.findRefs(e),function(e,r){n.set(JsonRefs.pathFromPointer(r),"#/models/"+e)})),JsonRefs.resolveRefs(e,function(e,n){return e?r(e):(i.resolved=n,i.resolvedId=SparkMD5.hash(JSON.stringify(n)),void r())}))},validateAgainstSchema=function(e,r,n,i){var t=_.isString(r)?e.validators[r]:helpers.createJsonValidator(),o=function(){try{validators.validateAgainstSchema(r,n,t)}catch(e){return e.failedValidation?i(void 0,e.results):i(e)}resolveRefs(n,function(e){return i(e)})};addExternalRefsToValidator(t,n,function(e){return e?i(e):void o()})},validateDefinitions=function(e,r){_.each(e.definitions,function(n,i){var t=JsonRefs.pathFromPointer(i),o=t[0].substring(0,t[0].length-1),a="1.2"===e.swaggerVersion?t[t.length-1]:i,s="securityDefinition"===o?"SECURITY_DEFINITION":o.toUpperCase(),c="securityDefinition"===o?"Security definition":o.charAt(0).toUpperCase()+o.substring(1);0!==n.references.length||n.inline||(n.scopePath&&(s+="_SCOPE",c+=" scope",t=n.scopePath),createUnusedErrorOrWarning(a,s,c,t,r.warnings))})},validateParameters=function(e,r,n,i,t,o,a){var s=[],c=!1;_.reduce(i,function(i,a,d){var u=t.concat(["parameters",d.toString()]);if(!_.isUndefined(a))return validateNoExist(i,a.name,"PARAMETER","Parameter",u.concat("name"),o.errors),"body"===a.paramType||"body"===a["in"]?(c===!0&&createErrorOrWarning("DULPICATE_API_BODY_PARAMETER","API has more than one body parameter",u,o.errors),c=!0):("path"===a.paramType||"path"===a["in"])&&(-1===n.args.indexOf(a.name)&&createErrorOrWarning("UNRESOLVABLE_API_PATH_PARAMETER","API path parameter could not be resolved: "+a.name,u.concat("name"),o.errors),s.push(a.name)),-1===e.primitives.indexOf(a.type)&&"1.2"===e.version&&addReference(r,"#/models/"+a.type,u.concat("type"),o),validateSchemaConstraints(r,a,u,o,a.skipErrors),i.concat(a.name)},[]),(_.isUndefined(a)||a===!1)&&_.each(_.difference(n.args,s),function(e){createErrorOrWarning("MISSING_API_PATH_PARAMETER","API requires path parameter but it is not defined: "+e,"1.2"===r.swaggerVersion?t.slice(0,2).concat("path"):t,o.errors)})},validateSwagger1_2=function(e,r,n,i){var t=[],o=getDocumentCache(r),a=[],s={errors:[],warnings:[],apiDeclarations:[]};a=_.reduce(r.apis,function(e,r,n){return validateNoExist(e,r.path,"RESOURCE_PATH","Resource path",["apis",n.toString(),"path"],s.errors),e.push(r.path),e},[]),processDocument(o,s),t=_.reduce(n,function(r,n,i){var c=s.apiDeclarations[i]={errors:[],warnings:[]},d=getDocumentCache(n);return validateNoExist(r,n.resourcePath,"RESOURCE_PATH","Resource path",["resourcePath"],c.errors),-1===t.indexOf(n.resourcePath)&&(validateExist(a,n.resourcePath,"RESOURCE_PATH","Resource path",["resourcePath"],c.errors),r.push(n.resourcePath)),processDocument(d,c),_.reduce(n.apis,function(r,n,i){var t=["apis",i.toString()],a=normalizePath(n.path);return r.indexOf(a.path)>-1?createErrorOrWarning("DUPLICATE_API_PATH","API path (or equivalent) already defined: "+n.path,t.concat("path"),c.errors):r.push(a.path),_.reduce(n.operations,function(r,n,i){var s=t.concat(["operations",i.toString()]);return validateNoExist(r,n.method,"OPERATION_METHOD","Operation method",s.concat("method"),c.errors),r.push(n.method),-1===e.primitives.indexOf(n.type)&&"1.2"===e.version&&addReference(d,"#/models/"+n.type,s.concat("type"),c),processAuthRefs(o,n.authorizations,s.concat("authorizations"),c),validateSchemaConstraints(d,n,s,c),validateParameters(e,d,a,n.parameters,s,c),_.reduce(n.responseMessages,function(e,r,n){var i=s.concat(["responseMessages",n.toString()]);return validateNoExist(e,r.code,"RESPONSE_MESSAGE_CODE","Response message code",i.concat(["code"]),c.errors),r.responseModel&&addReference(d,"#/models/"+r.responseModel,i.concat("responseModel"),c),e.concat(r.code)},[]),r},[]),r},[]),validateDefinitions(d,c),r},[]),validateDefinitions(o,s),_.each(_.difference(a,t),function(e){var n=a.indexOf(e);createUnusedErrorOrWarning(r.apis[n].path,"RESOURCE_PATH","Resource path",["apis",n.toString(),"path"],s.errors)}),i(void 0,s)},validateSwagger2_0=function(e,r,n){var i=getDocumentCache(r),t={errors:[],warnings:[]};processDocument(i,t),processAuthRefs(i,r.security,["security"],t),_.reduce(i.resolved.paths,function(r,n,o){var a=["paths",o],s=normalizePath(o);return r.indexOf(s.path)>-1&&createErrorOrWarning("DUPLICATE_API_PATH","API path (or equivalent) already defined: "+o,a,t.errors),validateParameters(e,i,s,n.parameters,a,t,!0),_.each(n,function(r,o){var c=[],d=a.concat(o),u=[];-1!==validOptionNames.indexOf(o)&&(processAuthRefs(i,r.security,d.concat("security"),t),_.each(r.parameters,function(e){c.push(e),u.push(e.name+":"+e["in"])}),_.each(n.parameters,function(e){var r=_.cloneDeep(e);r.skipErrors=!0,-1===u.indexOf(e.name+":"+e["in"])&&c.push(r)}),validateParameters(e,i,s,c,d,t),_.each(r.responses,function(e,r){_.isUndefined(e)||validateSchemaConstraints(i,e,d.concat("responses",r),t)}))}),r.concat(s.path)},[]),validateDefinitions(i,t),n(void 0,t)},validateSemantically=function(e,r,n,i){var t=function(e,r){i(e,helpers.formatResults(r))};"1.2"===e.version?validateSwagger1_2(e,r,n,t):validateSwagger2_0(e,r,t)},validateStructurally=function(e,r,n,i){validateAgainstSchema(e,"1.2"===e.version?"resourceListing.json":"schema.json",r,function(r,t){return r?i(r):void(t||"1.2"!==e.version?i(void 0,t):(t={errors:[],warnings:[],apiDeclarations:[]},async.map(n,function(r,n){validateAgainstSchema(e,"apiDeclaration.json",r,n)},function(e,r){return e?i(e):(_.each(r,function(e,r){t.apiDeclarations[r]=e}),void i(void 0,t))})))})},Specification=function(e){var r=function(e,r){return _.reduce(r,function(e,r,n){return e[n]=helpers.createJsonValidator(r),e}.bind(this),{})},n=function(e){var r=_.cloneDeep(this.schemas[e]);return r.id=e,r}.bind(this),i=["string","number","boolean","integer","array"];switch(e){case"1.2":this.docsUrl="https://github.com/swagger-api/swagger-spec/blob/master/versions/1.2.md",this.primitives=_.union(i,["void","File"]),this.schemasUrl="https://github.com/swagger-api/swagger-spec/tree/master/schemas/v1.2",this.schemas={"apiDeclaration.json":require("../schemas/1.2/apiDeclaration.json"),"authorizationObject.json":require("../schemas/1.2/authorizationObject.json"),"dataType.json":require("../schemas/1.2/dataType.json"),"dataTypeBase.json":require("../schemas/1.2/dataTypeBase.json"),"infoObject.json":require("../schemas/1.2/infoObject.json"),"modelsObject.json":require("../schemas/1.2/modelsObject.json"),"oauth2GrantType.json":require("../schemas/1.2/oauth2GrantType.json"),"operationObject.json":require("../schemas/1.2/operationObject.json"),"parameterObject.json":require("../schemas/1.2/parameterObject.json"),"resourceListing.json":require("../schemas/1.2/resourceListing.json"),"resourceObject.json":require("../schemas/1.2/resourceObject.json")},this.validators=r(this,{"apiDeclaration.json":_.map(["dataTypeBase.json","modelsObject.json","oauth2GrantType.json","authorizationObject.json","parameterObject.json","operationObject.json","apiDeclaration.json"],n),"resourceListing.json":_.map(["resourceObject.json","infoObject.json","oauth2GrantType.json","authorizationObject.json","resourceListing.json"],n)});break;case"2.0":this.docsUrl="https://github.com/swagger-api/swagger-spec/blob/master/versions/2.0.md",this.primitives=_.union(i,["file"]),this.schemasUrl="https://github.com/swagger-api/swagger-spec/tree/master/schemas/v2.0",this.schemas={"schema.json":require("../schemas/2.0/schema.json")},this.validators=r(this,{"schema.json":[n("schema.json")]});break;default:throw new Error(e+" is an unsupported Swagger specification version")}this.version=e};Specification.prototype.validate=function(e,r,n){switch(this.version){case"1.2":if(_.isUndefined(e))throw new Error("resourceListing is required");if(!_.isPlainObject(e))throw new TypeError("resourceListing must be an object");if(_.isUndefined(r))throw new Error("apiDeclarations is required");if(!_.isArray(r))throw new TypeError("apiDeclarations must be an array");break;case"2.0":if(_.isUndefined(e))throw new Error("swaggerObject is required");if(!_.isPlainObject(e))throw new TypeError("swaggerObject must be an object")}if("2.0"===this.version&&(n=arguments[1]),_.isUndefined(n))throw new Error("callback is required");if(!_.isFunction(n))throw new TypeError("callback must be a function");"2.0"===this.version&&(r=[]),validateStructurally(this,e,r,function(i,t){i||helpers.formatResults(t)?n(i,t):validateSemantically(this,e,r,n)}.bind(this))},Specification.prototype.composeModel=function(e,r,n){var i=helpers.getSwaggerVersion(e),t=function(i,t){var o;return i?n(i):helpers.getErrorCount(t)>0?handleValidationError(t,n):(o=getDocumentCache(e),t={errors:[],warnings:[]},processDocument(o,t),o.definitions[r]?helpers.getErrorCount(t)>0?handleValidationError(t,n):void n(void 0,getOrComposeSchema(o,r)):n())};switch(this.version){case"1.2":if(_.isUndefined(e))throw new Error("apiDeclaration is required");if(!_.isPlainObject(e))throw new TypeError("apiDeclaration must be an object");if(_.isUndefined(r))throw new Error("modelId is required");break;case"2.0":if(_.isUndefined(e))throw new Error("swaggerObject is required");if(!_.isPlainObject(e))throw new TypeError("swaggerObject must be an object");if(_.isUndefined(r))throw new Error("modelRef is required")}if(_.isUndefined(n))throw new Error("callback is required");if(!_.isFunction(n))throw new TypeError("callback must be a function");if("#"!==r.charAt(0)){if("1.2"!==this.version)throw new Error("modelRef must be a JSON Pointer");r="#/models/"+r}"1.2"===i?validateAgainstSchema(this,"apiDeclaration.json",e,t):this.validate(e,t)},Specification.prototype.validateModel=function(e,r,n,i){switch(this.version){case"1.2":if(_.isUndefined(e))throw new Error("apiDeclaration is required");if(!_.isPlainObject(e))throw new TypeError("apiDeclaration must be an object");if(_.isUndefined(r))throw new Error("modelId is required");break;case"2.0":if(_.isUndefined(e))throw new Error("swaggerObject is required");if(!_.isPlainObject(e))throw new TypeError("swaggerObject must be an object");if(_.isUndefined(r))throw new Error("modelRef is required")}if(_.isUndefined(n))throw new Error("data is required");if(_.isUndefined(i))throw new Error("callback is required");if(!_.isFunction(i))throw new TypeError("callback must be a function");this.composeModel(e,r,function(e,r){return e?i(e):void validateAgainstSchema(this,r,n,i)}.bind(this))},Specification.prototype.resolve=function(e,r,n){var i,t,o=function(e){return _.isString(r)?n(void 0,traverse(e).get(JsonRefs.pathFromPointer(r))):n(void 0,e)};if(_.isUndefined(e))throw new Error("document is required");if(!_.isPlainObject(e))throw new TypeError("document must be an object");if(2===arguments.length&&(n=arguments[1],r=void 0),!_.isUndefined(r)&&!_.isString(r))throw new TypeError("ptr must be a JSON Pointer string");if(_.isUndefined(n))throw new Error("callback is required");if(!_.isFunction(n))throw new TypeError("callback must be a function");if(i=getDocumentCache(e),"1.2"===i.swaggerVersion)throw new Error("Swagger 1.2 is not supported");return i.resolved?o(i.resolved):(t="1.2"===i.swaggerVersion?_.find(["basePath","consumes","models","produces","resourcePath"],function(r){return!_.isUndefined(e[r])})?"apiDeclaration.json":"resourceListing.json":"schema.json",void this.validate(e,function(e,r){return e?n(e):helpers.getErrorCount(r)>0?handleValidationError(r,n):o(i.resolved)}))},Specification.prototype.convert=function(e,r,n,i){var t=function(e,r){i(void 0,swaggerConverter(e,r))}.bind(this);if("1.2"!==this.version)throw new Error("Specification#convert only works for Swagger 1.2");if(_.isUndefined(e))throw new Error("resourceListing is required");if(!_.isPlainObject(e))throw new TypeError("resourceListing must be an object");if(_.isUndefined(r)&&(r=[]),!_.isArray(r))throw new TypeError("apiDeclarations must be an array");if(arguments.length<4&&(i=arguments[arguments.length-1]),_.isUndefined(i))throw new Error("callback is required");if(!_.isFunction(i))throw new TypeError("callback must be a function");n===!0?t(e,r):this.validate(e,r,function(n,o){return n?i(n):helpers.getErrorCount(o)>0?handleValidationError(o,i):void t(e,r)})},module.exports.v1=module.exports.v1_2=new Specification("1.2"),module.exports.v2=module.exports.v2_0=new Specification("2.0");
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../schemas/1.2/apiDeclaration.json":150,"../schemas/1.2/authorizationObject.json":151,"../schemas/1.2/dataType.json":152,"../schemas/1.2/dataTypeBase.json":153,"../schemas/1.2/infoObject.json":154,"../schemas/1.2/modelsObject.json":155,"../schemas/1.2/oauth2GrantType.json":156,"../schemas/1.2/operationObject.json":157,"../schemas/1.2/parameterObject.json":158,"../schemas/1.2/resourceListing.json":159,"../schemas/1.2/resourceObject.json":160,"../schemas/2.0/schema.json":161,"./helpers":2,"./validators":3,"async":4,"json-refs":11,"lodash":84,"spark-md5":85,"swagger-converter":89,"traverse":136}],2:[function(require,module,exports){
(function (process){
"use strict";var _=require("lodash"),JsonRefs=require("json-refs"),ZSchema=require("z-schema"),draft04Json=require("../schemas/json-schema-draft-04.json"),draft04Url="http://json-schema.org/draft-04/schema",specCache={};module.exports.createJsonValidator=function(r){var e,n=new ZSchema({reportPathAsArray:!0});if(n.setRemoteReference(draft04Url,draft04Json),_.each(["byte","double","float","int32","int64","mime-type","uri-template"],function(r){ZSchema.registerFormat(r,function(){return!0})}),!_.isUndefined(r)&&(e=n.compileSchema(r),e===!1))throw console.error("JSON Schema file"+(r.length>1?"s are":" is")+" invalid:"),_.each(n.getLastErrors(),function(r){console.error("  "+(_.isArray(r.path)?JsonRefs.pathToPointer(r.path):r.path)+": "+r.message)}),new Error("Unable to create validator due to invalid JSON Schema");return n},module.exports.formatResults=function(r){return r?r.errors.length+r.warnings.length+_.reduce(r.apiDeclarations,function(r,e){return e&&(r+=e.errors.length+e.warnings.length),r},0)>0?r:void 0:r},module.exports.getErrorCount=function(r){var e=0;return r&&(e=r.errors.length,_.each(r.apiDeclarations,function(r){r&&(e+=r.errors.length)})),e};var coerseVersion=function(r){return r&&!_.isString(r)&&(r=r.toString(),-1===r.indexOf(".")&&(r+=".0")),r};module.exports.getSpec=function(r,e){var n;if(r=coerseVersion(r),n=specCache[r],_.isUndefined(n))switch(r){case"1.2":n=require("../lib/specs").v1_2;break;case"2.0":n=require("../lib/specs").v2_0;break;default:if(e===!0)throw new Error("Unsupported Swagger version: "+r)}return n},module.exports.getSwaggerVersion=function(r){return _.isPlainObject(r)?coerseVersion(r.swaggerVersion||r.swagger):void 0};var toJsonPointer=module.exports.toJsonPointer=function(r){return"#/"+r.map(function(r){return r.replace(/~/g,"~0").replace(/\//g,"~1")}).join("/")};module.exports.printValidationResults=function(r,e,n,o,t,s){var a=function(r,e){return 1===e?r:r+"s"},i=function u(r,e,n){r&&(console.error(r+":"),console.error()),_.each(e,function(r){console.error(new Array(n+1).join(" ")+toJsonPointer(r.path)+": "+r.message),r.inner&&u(void 0,r.inner,n+2)}),r&&console.error()},c=0,l=0;console.error(),o.errors.length>0&&(c+=o.errors.length,i("API Errors",o.errors,2)),o.warnings.length>0&&(l+=o.warnings.length,i("API Warnings",o.warnings,2)),o.apiDeclarations&&o.apiDeclarations.forEach(function(r,e){if(r){var o=n[e].resourcePath||e;r.errors.length>0&&(c+=r.errors.length,i("  API Declaration ("+o+") Errors",r.errors,4)),r.warnings.length>0&&(l+=r.warnings.length,i("  API Declaration ("+o+") Warnings",r.warnings,4))}}),t&&console.error(c>0?c+" "+a("error",c)+" and "+l+" "+a("warning",l):"Validation succeeded but with "+l+" "+a("warning",l)),c>0&&s&&process.exit(1)},module.exports.swaggerOperationMethods=["DELETE","GET","HEAD","OPTIONS","PATCH","POST","PUT"];


}).call(this,require('_process'))
},{"../lib/specs":undefined,"../schemas/json-schema-draft-04.json":162,"_process":5,"json-refs":11,"lodash":84,"z-schema":147}],3:[function(require,module,exports){
"use strict";var _=require("lodash"),helpers=require("./helpers"),dateRegExp=/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/,dateTimeRegExp=/^([0-9]{2}):([0-9]{2}):([0-9]{2})(.[0-9]+)?(z|([+-][0-9]{2}:[0-9]{2}))$/,isValidDate=function(e){var t,i,a;return _.isString(e)||(e=e.toString()),i=dateRegExp.exec(e),null===i?!1:(t=i[3],a=i[2],"01">a||a>"12"||"01">t||t>"31"?!1:!0)},isValidDateTime=function(e){var t,i,a,r,n,o,d;return _.isString(e)||(e=e.toString()),o=e.toLowerCase().split("t"),i=o[0],a=o.length>1?o[1]:void 0,isValidDate(i)?(r=dateTimeRegExp.exec(a),null===r?!1:(t=r[1],n=r[2],d=r[3],t>"23"||n>"59"||d>"59"?!1:!0)):!1},throwErrorWithCode=function(e,t){var i=new Error(t);throw i.code=e,i.failedValidation=!0,i};module.exports.validateAgainstSchema=function(e,t,i){var a=function(e){delete e.params,e.inner&&_.each(e.inner,function(e){a(e)})},r=_.isPlainObject(e)?_.cloneDeep(e):e;_.isUndefined(i)&&(i=helpers.createJsonValidator([r]));var n=i.validate(t,r);if(!n)try{throwErrorWithCode("SCHEMA_VALIDATION_FAILED","Failed schema validation")}catch(o){throw o.results={errors:_.map(i.getLastErrors(),function(e){return a(e),e}),warnings:[]},o}};var validateArrayType=module.exports.validateArrayType=function(e){"array"===e.type&&_.isUndefined(e.items)&&throwErrorWithCode("OBJECT_MISSING_REQUIRED_PROPERTY","Missing required property: items")};module.exports.validateContentType=function(e,t,i){var a="function"==typeof i.end,r=a?i.getHeader("content-type"):i.headers["content-type"],n=_.union(e,t);if(r||(r=a?"text/plain":"application/octet-stream"),r=r.split(";")[0],n.length>0&&(a?!0:-1!==["POST","PUT"].indexOf(i.method))&&-1===n.indexOf(r))throw new Error("Invalid content type ("+r+").  These are valid: "+n.join(", "))};var validateEnum=module.exports.validateEnum=function(e,t){_.isUndefined(t)||_.isUndefined(e)||-1!==t.indexOf(e)||throwErrorWithCode("ENUM_MISMATCH","Not an allowable value ("+t.join(", ")+"): "+e)},validateMaximum=module.exports.validateMaximum=function(e,t,i,a){var r,n,o=a===!0?"MAXIMUM_EXCLUSIVE":"MAXIMUM";_.isUndefined(a)&&(a=!1),"integer"===i?n=parseInt(e,10):"number"===i&&(n=parseFloat(e)),_.isUndefined(t)||(r=parseFloat(t),a&&n>=r?throwErrorWithCode(o,"Greater than or equal to the configured maximum ("+t+"): "+e):n>r&&throwErrorWithCode(o,"Greater than the configured maximum ("+t+"): "+e))},validateMaxItems=module.exports.validateMaxItems=function(e,t){!_.isUndefined(t)&&e.length>t&&throwErrorWithCode("ARRAY_LENGTH_LONG","Array is too long ("+e.length+"), maximum "+t)},validateMaxLength=module.exports.validateMaxLength=function(e,t){!_.isUndefined(t)&&e.length>t&&throwErrorWithCode("MAX_LENGTH","String is too long ("+e.length+" chars), maximum "+t)},validateMaxProperties=module.exports.validateMaxProperties=function(e,t){var i=_.isPlainObject(e)?Object.keys(e).length:0;!_.isUndefined(t)&&i>t&&throwErrorWithCode("MAX_PROPERTIES","Number of properties is too many ("+i+" properties), maximum "+t)},validateMinimum=module.exports.validateMinimum=function(e,t,i,a){var r,n,o=a===!0?"MINIMUM_EXCLUSIVE":"MINIMUM";_.isUndefined(a)&&(a=!1),"integer"===i?n=parseInt(e,10):"number"===i&&(n=parseFloat(e)),_.isUndefined(t)||(r=parseFloat(t),a&&r>=n?throwErrorWithCode(o,"Less than or equal to the configured minimum ("+t+"): "+e):r>n&&throwErrorWithCode(o,"Less than the configured minimum ("+t+"): "+e))},validateMinItems=module.exports.validateMinItems=function(e,t){!_.isUndefined(t)&&e.length<t&&throwErrorWithCode("ARRAY_LENGTH_SHORT","Array is too short ("+e.length+"), minimum "+t)},validateMinLength=module.exports.validateMinLength=function(e,t){!_.isUndefined(t)&&e.length<t&&throwErrorWithCode("MIN_LENGTH","String is too short ("+e.length+" chars), minimum "+t)},validateMinProperties=module.exports.validateMinProperties=function(e,t){var i=_.isPlainObject(e)?Object.keys(e).length:0;!_.isUndefined(t)&&t>i&&throwErrorWithCode("MIN_PROPERTIES","Number of properties is too few ("+i+" properties), minimum "+t)},validateMultipleOf=module.exports.validateMultipleOf=function(e,t){_.isUndefined(t)||e%t===0||throwErrorWithCode("MULTIPLE_OF","Not a multiple of "+t)},validatePattern=module.exports.validatePattern=function(e,t){!_.isUndefined(t)&&_.isNull(e.match(new RegExp(t)))&&throwErrorWithCode("PATTERN","Does not match required pattern: "+t)};module.exports.validateRequiredness=function(e,t){!_.isUndefined(t)&&t===!0&&_.isUndefined(e)&&throwErrorWithCode("REQUIRED","Is required")};var validateTypeAndFormat=module.exports.validateTypeAndFormat=function e(t,i,a,r){var n=!0;if(_.isArray(t))_.each(t,function(t,r){e(t,i,a,!0)||throwErrorWithCode("INVALID_TYPE","Value at index "+r+" is not a valid "+i+": "+t)});else switch(i){case"boolean":n=_.isBoolean(t)||-1!==["false","true"].indexOf(t);break;case"integer":n=!_.isNaN(parseInt(t,10));break;case"number":n=!_.isNaN(parseFloat(t));break;case"string":if(!_.isUndefined(a))switch(a){case"date":n=isValidDate(t);break;case"date-time":n=isValidDateTime(t)}break;case"void":n=_.isUndefined(t)}return r?n:void(n||throwErrorWithCode("INVALID_TYPE","void"!==i?"Not a valid "+(_.isUndefined(a)?"":a+" ")+i+": "+t:"Void does not allow a value"))},validateUniqueItems=module.exports.validateUniqueItems=function(e,t){_.isUndefined(t)||_.uniq(e).length===e.length||throwErrorWithCode("ARRAY_UNIQUE","Does not allow duplicate values: "+e.join(", "))};module.exports.validateSchemaConstraints=function(e,t,i,a){var r=function d(e){var t=e;return t.schema&&(i=i.concat(["schema"]),t=d(t.schema)),t},n=t.type;n||(t.schema?(t=r(t),n=t.type||"object"):n="responses"===i[i.length-2]?"void":"object");try{if("array"===n&&validateArrayType(t),_.isUndefined(a)&&(a="1.2"===e?t.defaultValue:t["default"],i=i.concat(["1.2"===e?"defaultValue":"default"])),_.isUndefined(a))return;"array"===n?_.isUndefined(t.items)?validateTypeAndFormat(a,n,t.format):validateTypeAndFormat(a,"array"===n?t.items.type:n,"array"===n&&t.items.format?t.items.format:t.format):validateTypeAndFormat(a,n,t.format),validateEnum(a,t["enum"]),validateMaximum(a,t.maximum,n,t.exclusiveMaximum),validateMaxItems(a,t.maxItems),validateMaxLength(a,t.maxLength),validateMaxProperties(a,t.maxProperties),validateMinimum(a,t.minimum,n,t.exclusiveMinimum),validateMinItems(a,t.minItems),validateMinLength(a,t.minLength),validateMinProperties(a,t.minProperties),validateMultipleOf(a,t.multipleOf),validatePattern(a,t.pattern),validateUniqueItems(a,t.uniqueItems)}catch(o){throw o.path=i,o}};


},{"./helpers":2,"lodash":84}],4:[function(require,module,exports){
(function (process){
!function(){function n(n){var e=!1;return function(){if(e)throw new Error("Callback was already called.");e=!0,n.apply(t,arguments)}}var t,e,r={};t=this,null!=t&&(e=t.async),r.noConflict=function(){return t.async=e,r};var u=Object.prototype.toString,i=Array.isArray||function(n){return"[object Array]"===u.call(n)},c=function(n,t){if(n.forEach)return n.forEach(t);for(var e=0;e<n.length;e+=1)t(n[e],e,n)},a=function(n,t){if(n.map)return n.map(t);var e=[];return c(n,function(n,r,u){e.push(t(n,r,u))}),e},o=function(n,t,e){return n.reduce?n.reduce(t,e):(c(n,function(n,r,u){e=t(e,n,r,u)}),e)},l=function(n){if(Object.keys)return Object.keys(n);var t=[];for(var e in n)n.hasOwnProperty(e)&&t.push(e);return t};"undefined"!=typeof process&&process.nextTick?(r.nextTick=process.nextTick,"undefined"!=typeof setImmediate?r.setImmediate=function(n){setImmediate(n)}:r.setImmediate=r.nextTick):"function"==typeof setImmediate?(r.nextTick=function(n){setImmediate(n)},r.setImmediate=r.nextTick):(r.nextTick=function(n){setTimeout(n,0)},r.setImmediate=r.nextTick),r.each=function(t,e,r){function u(n){n?(r(n),r=function(){}):(i+=1,i>=t.length&&r())}if(r=r||function(){},!t.length)return r();var i=0;c(t,function(t){e(t,n(u))})},r.forEach=r.each,r.eachSeries=function(n,t,e){if(e=e||function(){},!n.length)return e();var r=0,u=function(){t(n[r],function(t){t?(e(t),e=function(){}):(r+=1,r>=n.length?e():u())})};u()},r.forEachSeries=r.eachSeries,r.eachLimit=function(n,t,e,r){var u=f(t);u.apply(null,[n,e,r])},r.forEachLimit=r.eachLimit;var f=function(n){return function(t,e,r){if(r=r||function(){},!t.length||0>=n)return r();var u=0,i=0,c=0;!function a(){if(u>=t.length)return r();for(;n>c&&i<t.length;)i+=1,c+=1,e(t[i-1],function(n){n?(r(n),r=function(){}):(u+=1,c-=1,u>=t.length?r():a())})}()}},s=function(n){return function(){var t=Array.prototype.slice.call(arguments);return n.apply(null,[r.each].concat(t))}},p=function(n,t){return function(){var e=Array.prototype.slice.call(arguments);return t.apply(null,[f(n)].concat(e))}},d=function(n){return function(){var t=Array.prototype.slice.call(arguments);return n.apply(null,[r.eachSeries].concat(t))}},y=function(n,t,e,r){if(t=a(t,function(n,t){return{index:t,value:n}}),r){var u=[];n(t,function(n,t){e(n.value,function(e,r){u[n.index]=r,t(e)})},function(n){r(n,u)})}else n(t,function(n,t){e(n.value,function(n){t(n)})})};r.map=s(y),r.mapSeries=d(y),r.mapLimit=function(n,t,e,r){return m(t)(n,e,r)};var m=function(n){return p(n,y)};r.reduce=function(n,t,e,u){r.eachSeries(n,function(n,r){e(t,n,function(n,e){t=e,r(n)})},function(n){u(n,t)})},r.inject=r.reduce,r.foldl=r.reduce,r.reduceRight=function(n,t,e,u){var i=a(n,function(n){return n}).reverse();r.reduce(i,t,e,u)},r.foldr=r.reduceRight;var v=function(n,t,e,r){var u=[];t=a(t,function(n,t){return{index:t,value:n}}),n(t,function(n,t){e(n.value,function(e){e&&u.push(n),t()})},function(n){r(a(u.sort(function(n,t){return n.index-t.index}),function(n){return n.value}))})};r.filter=s(v),r.filterSeries=d(v),r.select=r.filter,r.selectSeries=r.filterSeries;var h=function(n,t,e,r){var u=[];t=a(t,function(n,t){return{index:t,value:n}}),n(t,function(n,t){e(n.value,function(e){e||u.push(n),t()})},function(n){r(a(u.sort(function(n,t){return n.index-t.index}),function(n){return n.value}))})};r.reject=s(h),r.rejectSeries=d(h);var g=function(n,t,e,r){n(t,function(n,t){e(n,function(e){e?(r(n),r=function(){}):t()})},function(n){r()})};r.detect=s(g),r.detectSeries=d(g),r.some=function(n,t,e){r.each(n,function(n,r){t(n,function(n){n&&(e(!0),e=function(){}),r()})},function(n){e(!1)})},r.any=r.some,r.every=function(n,t,e){r.each(n,function(n,r){t(n,function(n){n||(e(!1),e=function(){}),r()})},function(n){e(!0)})},r.all=r.every,r.sortBy=function(n,t,e){r.map(n,function(n,e){t(n,function(t,r){t?e(t):e(null,{value:n,criteria:r})})},function(n,t){if(n)return e(n);var r=function(n,t){var e=n.criteria,r=t.criteria;return r>e?-1:e>r?1:0};e(null,a(t.sort(r),function(n){return n.value}))})},r.auto=function(n,t){t=t||function(){};var e=l(n),u=e.length;if(!u)return t();var a={},f=[],s=function(n){f.unshift(n)},p=function(n){for(var t=0;t<f.length;t+=1)if(f[t]===n)return void f.splice(t,1)},d=function(){u--,c(f.slice(0),function(n){n()})};s(function(){if(!u){var n=t;t=function(){},n(null,a)}}),c(e,function(e){var u=i(n[e])?n[e]:[n[e]],f=function(n){var u=Array.prototype.slice.call(arguments,1);if(u.length<=1&&(u=u[0]),n){var i={};c(l(a),function(n){i[n]=a[n]}),i[e]=u,t(n,i),t=function(){}}else a[e]=u,r.setImmediate(d)},y=u.slice(0,Math.abs(u.length-1))||[],m=function(){return o(y,function(n,t){return n&&a.hasOwnProperty(t)},!0)&&!a.hasOwnProperty(e)};if(m())u[u.length-1](f,a);else{var v=function(){m()&&(p(v),u[u.length-1](f,a))};s(v)}})},r.retry=function(n,t,e){var u=5,i=[];"function"==typeof n&&(e=t,t=n,n=u),n=parseInt(n,10)||u;var c=function(u,c){for(var a=function(n,t){return function(e){n(function(n,r){e(!n||t,{err:n,result:r})},c)}};n;)i.push(a(t,!(n-=1)));r.series(i,function(n,t){t=t[t.length-1],(u||e)(t.err,t.result)})};return e?c():c},r.waterfall=function(n,t){if(t=t||function(){},!i(n)){var e=new Error("First argument to waterfall must be an array of functions");return t(e)}if(!n.length)return t();var u=function(n){return function(e){if(e)t.apply(null,arguments),t=function(){};else{var i=Array.prototype.slice.call(arguments,1),c=n.next();i.push(c?u(c):t),r.setImmediate(function(){n.apply(null,i)})}}};u(r.iterator(n))()};var k=function(n,t,e){if(e=e||function(){},i(t))n.map(t,function(n,t){n&&n(function(n){var e=Array.prototype.slice.call(arguments,1);e.length<=1&&(e=e[0]),t.call(null,n,e)})},e);else{var r={};n.each(l(t),function(n,e){t[n](function(t){var u=Array.prototype.slice.call(arguments,1);u.length<=1&&(u=u[0]),r[n]=u,e(t)})},function(n){e(n,r)})}};r.parallel=function(n,t){k({map:r.map,each:r.each},n,t)},r.parallelLimit=function(n,t,e){k({map:m(t),each:f(t)},n,e)},r.series=function(n,t){if(t=t||function(){},i(n))r.mapSeries(n,function(n,t){n&&n(function(n){var e=Array.prototype.slice.call(arguments,1);e.length<=1&&(e=e[0]),t.call(null,n,e)})},t);else{var e={};r.eachSeries(l(n),function(t,r){n[t](function(n){var u=Array.prototype.slice.call(arguments,1);u.length<=1&&(u=u[0]),e[t]=u,r(n)})},function(n){t(n,e)})}},r.iterator=function(n){var t=function(e){var r=function(){return n.length&&n[e].apply(null,arguments),r.next()};return r.next=function(){return e<n.length-1?t(e+1):null},r};return t(0)},r.apply=function(n){var t=Array.prototype.slice.call(arguments,1);return function(){return n.apply(null,t.concat(Array.prototype.slice.call(arguments)))}};var A=function(n,t,e,r){var u=[];n(t,function(n,t){e(n,function(n,e){u=u.concat(e||[]),t(n)})},function(n){r(n,u)})};r.concat=s(A),r.concatSeries=d(A),r.whilst=function(n,t,e){n()?t(function(u){return u?e(u):void r.whilst(n,t,e)}):e()},r.doWhilst=function(n,t,e){n(function(u){if(u)return e(u);var i=Array.prototype.slice.call(arguments,1);t.apply(null,i)?r.doWhilst(n,t,e):e()})},r.until=function(n,t,e){n()?e():t(function(u){return u?e(u):void r.until(n,t,e)})},r.doUntil=function(n,t,e){n(function(u){if(u)return e(u);var i=Array.prototype.slice.call(arguments,1);t.apply(null,i)?e():r.doUntil(n,t,e)})},r.queue=function(t,e){function u(n,t,e,u){return n.started||(n.started=!0),i(t)||(t=[t]),0==t.length?r.setImmediate(function(){n.drain&&n.drain()}):void c(t,function(t){var i={data:t,callback:"function"==typeof u?u:null};e?n.tasks.unshift(i):n.tasks.push(i),n.saturated&&n.tasks.length===n.concurrency&&n.saturated(),r.setImmediate(n.process)})}void 0===e&&(e=1);var a=0,o={tasks:[],concurrency:e,saturated:null,empty:null,drain:null,started:!1,paused:!1,push:function(n,t){u(o,n,!1,t)},kill:function(){o.drain=null,o.tasks=[]},unshift:function(n,t){u(o,n,!0,t)},process:function(){if(!o.paused&&a<o.concurrency&&o.tasks.length){var e=o.tasks.shift();o.empty&&0===o.tasks.length&&o.empty(),a+=1;var r=function(){a-=1,e.callback&&e.callback.apply(e,arguments),o.drain&&o.tasks.length+a===0&&o.drain(),o.process()},u=n(r);t(e.data,u)}},length:function(){return o.tasks.length},running:function(){return a},idle:function(){return o.tasks.length+a===0},pause:function(){o.paused!==!0&&(o.paused=!0,o.process())},resume:function(){o.paused!==!1&&(o.paused=!1,o.process())}};return o},r.priorityQueue=function(n,t){function e(n,t){return n.priority-t.priority}function u(n,t,e){for(var r=-1,u=n.length-1;u>r;){var i=r+(u-r+1>>>1);e(t,n[i])>=0?r=i:u=i-1}return r}function a(n,t,a,o){return n.started||(n.started=!0),i(t)||(t=[t]),0==t.length?r.setImmediate(function(){n.drain&&n.drain()}):void c(t,function(t){var i={data:t,priority:a,callback:"function"==typeof o?o:null};n.tasks.splice(u(n.tasks,i,e)+1,0,i),n.saturated&&n.tasks.length===n.concurrency&&n.saturated(),r.setImmediate(n.process)})}var o=r.queue(n,t);return o.push=function(n,t,e){a(o,n,t,e)},delete o.unshift,o},r.cargo=function(n,t){var e=!1,u=[],o={tasks:u,payload:t,saturated:null,empty:null,drain:null,drained:!0,push:function(n,e){i(n)||(n=[n]),c(n,function(n){u.push({data:n,callback:"function"==typeof e?e:null}),o.drained=!1,o.saturated&&u.length===t&&o.saturated()}),r.setImmediate(o.process)},process:function l(){if(!e){if(0===u.length)return o.drain&&!o.drained&&o.drain(),void(o.drained=!0);var r="number"==typeof t?u.splice(0,t):u.splice(0,u.length),i=a(r,function(n){return n.data});o.empty&&o.empty(),e=!0,n(i,function(){e=!1;var n=arguments;c(r,function(t){t.callback&&t.callback.apply(null,n)}),l()})}},length:function(){return u.length},running:function(){return e}};return o};var x=function(n){return function(t){var e=Array.prototype.slice.call(arguments,1);t.apply(null,e.concat([function(t){var e=Array.prototype.slice.call(arguments,1);"undefined"!=typeof console&&(t?console.error&&console.error(t):console[n]&&c(e,function(t){console[n](t)}))}]))}};r.log=x("log"),r.dir=x("dir"),r.memoize=function(n,t){var e={},u={};t=t||function(n){return n};var i=function(){var i=Array.prototype.slice.call(arguments),c=i.pop(),a=t.apply(null,i);a in e?r.nextTick(function(){c.apply(null,e[a])}):a in u?u[a].push(c):(u[a]=[c],n.apply(null,i.concat([function(){e[a]=arguments;var n=u[a];delete u[a];for(var t=0,r=n.length;r>t;t++)n[t].apply(null,arguments)}])))};return i.memo=e,i.unmemoized=n,i},r.unmemoize=function(n){return function(){return(n.unmemoized||n).apply(null,arguments)}},r.times=function(n,t,e){for(var u=[],i=0;n>i;i++)u.push(i);return r.map(u,t,e)},r.timesSeries=function(n,t,e){for(var u=[],i=0;n>i;i++)u.push(i);return r.mapSeries(u,t,e)},r.seq=function(){var n=arguments;return function(){var t=this,e=Array.prototype.slice.call(arguments),u=e.pop();r.reduce(n,e,function(n,e,r){e.apply(t,n.concat([function(){var n=arguments[0],t=Array.prototype.slice.call(arguments,1);r(n,t)}]))},function(n,e){u.apply(t,[n].concat(e))})}},r.compose=function(){return r.seq.apply(null,Array.prototype.reverse.call(arguments))};var S=function(n,t){var e=function(){var e=this,r=Array.prototype.slice.call(arguments),u=r.pop();return n(t,function(n,t){n.apply(e,r.concat([t]))},u)};if(arguments.length>2){var r=Array.prototype.slice.call(arguments,2);return e.apply(this,r)}return e};r.applyEach=s(S),r.applyEachSeries=d(S),r.forever=function(n,t){function e(r){if(r){if(t)return t(r);throw r}n(e)}e()},"undefined"!=typeof module&&module.exports?module.exports=r:"undefined"!=typeof define&&define.amd?define([],function(){return r}):t.async=r}();


}).call(this,require('_process'))
},{"_process":5}],5:[function(require,module,exports){
function drainQueue(){if(!draining){draining=!0;for(var e,o=queue.length;o;){e=queue,queue=[];for(var r=-1;++r<o;)e[r]();o=queue.length}draining=!1}}function noop(){}var process=module.exports={},queue=[],draining=!1;process.nextTick=function(e){queue.push(e),draining||setTimeout(drainQueue,0)},process.title="browser",process.browser=!0,process.env={},process.argv=[],process.version="",process.versions={},process.on=noop,process.addListener=noop,process.once=noop,process.off=noop,process.removeListener=noop,process.removeAllListeners=noop,process.emit=noop,process.binding=function(e){throw new Error("process.binding is not supported")},process.cwd=function(){return"/"},process.chdir=function(e){throw new Error("process.chdir is not supported")},process.umask=function(){return 0};


},{}],6:[function(require,module,exports){
(function (global){
!function(o){function e(o){throw RangeError(L[o])}function n(o,e){for(var n=o.length;n--;)o[n]=e(o[n]);return o}function t(o,e){return n(o.split(S),e).join(".")}function r(o){for(var e,n,t=[],r=0,u=o.length;u>r;)e=o.charCodeAt(r++),e>=55296&&56319>=e&&u>r?(n=o.charCodeAt(r++),56320==(64512&n)?t.push(((1023&e)<<10)+(1023&n)+65536):(t.push(e),r--)):t.push(e);return t}function u(o){return n(o,function(o){var e="";return o>65535&&(o-=65536,e+=R(o>>>10&1023|55296),o=56320|1023&o),e+=R(o)}).join("")}function i(o){return 10>o-48?o-22:26>o-65?o-65:26>o-97?o-97:x}function f(o,e){return o+22+75*(26>o)-((0!=e)<<5)}function c(o,e,n){var t=0;for(o=n?P(o/m):o>>1,o+=P(o/e);o>M*C>>1;t+=x)o=P(o/M);return P(t+(M+1)*o/(o+j))}function l(o){var n,t,r,f,l,d,s,a,p,h,v=[],g=o.length,w=0,j=I,m=A;for(t=o.lastIndexOf(F),0>t&&(t=0),r=0;t>r;++r)o.charCodeAt(r)>=128&&e("not-basic"),v.push(o.charCodeAt(r));for(f=t>0?t+1:0;g>f;){for(l=w,d=1,s=x;f>=g&&e("invalid-input"),a=i(o.charCodeAt(f++)),(a>=x||a>P((b-w)/d))&&e("overflow"),w+=a*d,p=m>=s?y:s>=m+C?C:s-m,!(p>a);s+=x)h=x-p,d>P(b/h)&&e("overflow"),d*=h;n=v.length+1,m=c(w-l,n,0==l),P(w/n)>b-j&&e("overflow"),j+=P(w/n),w%=n,v.splice(w++,0,j)}return u(v)}function d(o){var n,t,u,i,l,d,s,a,p,h,v,g,w,j,m,E=[];for(o=r(o),g=o.length,n=I,t=0,l=A,d=0;g>d;++d)v=o[d],128>v&&E.push(R(v));for(u=i=E.length,i&&E.push(F);g>u;){for(s=b,d=0;g>d;++d)v=o[d],v>=n&&s>v&&(s=v);for(w=u+1,s-n>P((b-t)/w)&&e("overflow"),t+=(s-n)*w,n=s,d=0;g>d;++d)if(v=o[d],n>v&&++t>b&&e("overflow"),v==n){for(a=t,p=x;h=l>=p?y:p>=l+C?C:p-l,!(h>a);p+=x)m=a-h,j=x-h,E.push(R(f(h+m%j,0))),a=P(m/j);E.push(R(f(a,0))),l=c(t,w,u==i),t=0,++u}++t,++n}return E.join("")}function s(o){return t(o,function(o){return E.test(o)?l(o.slice(4).toLowerCase()):o})}function a(o){return t(o,function(o){return O.test(o)?"xn--"+d(o):o})}var p="object"==typeof exports&&exports,h="object"==typeof module&&module&&module.exports==p&&module,v="object"==typeof global&&global;(v.global===v||v.window===v)&&(o=v);var g,w,b=2147483647,x=36,y=1,C=26,j=38,m=700,A=72,I=128,F="-",E=/^xn--/,O=/[^ -~]/,S=/\x2E|\u3002|\uFF0E|\uFF61/g,L={overflow:"Overflow: input needs wider integers to process","not-basic":"Illegal input >= 0x80 (not a basic code point)","invalid-input":"Invalid input"},M=x-y,P=Math.floor,R=String.fromCharCode;if(g={version:"1.2.4",ucs2:{decode:r,encode:u},decode:l,encode:d,toASCII:a,toUnicode:s},"function"==typeof define&&"object"==typeof define.amd&&define.amd)define("punycode",function(){return g});else if(p&&!p.nodeType)if(h)h.exports=g;else for(w in g)g.hasOwnProperty(w)&&(p[w]=g[w]);else o.punycode=g}(this);


}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],7:[function(require,module,exports){
"use strict";function hasOwnProperty(r,e){return Object.prototype.hasOwnProperty.call(r,e)}module.exports=function(r,e,t,n){e=e||"&",t=t||"=";var o={};if("string"!=typeof r||0===r.length)return o;var a=/\+/g;r=r.split(e);var s=1e3;n&&"number"==typeof n.maxKeys&&(s=n.maxKeys);var p=r.length;s>0&&p>s&&(p=s);for(var y=0;p>y;++y){var u,c,i,l,f=r[y].replace(a,"%20"),v=f.indexOf(t);v>=0?(u=f.substr(0,v),c=f.substr(v+1)):(u=f,c=""),i=decodeURIComponent(u),l=decodeURIComponent(c),hasOwnProperty(o,i)?isArray(o[i])?o[i].push(l):o[i]=[o[i],l]:o[i]=l}return o};var isArray=Array.isArray||function(r){return"[object Array]"===Object.prototype.toString.call(r)};


},{}],8:[function(require,module,exports){
"use strict";function map(r,e){if(r.map)return r.map(e);for(var t=[],n=0;n<r.length;n++)t.push(e(r[n],n));return t}var stringifyPrimitive=function(r){switch(typeof r){case"string":return r;case"boolean":return r?"true":"false";case"number":return isFinite(r)?r:"";default:return""}};module.exports=function(r,e,t,n){return e=e||"&",t=t||"=",null===r&&(r=void 0),"object"==typeof r?map(objectKeys(r),function(n){var i=encodeURIComponent(stringifyPrimitive(n))+t;return isArray(r[n])?map(r[n],function(r){return i+encodeURIComponent(stringifyPrimitive(r))}).join(e):i+encodeURIComponent(stringifyPrimitive(r[n]))}).join(e):n?encodeURIComponent(stringifyPrimitive(n))+t+encodeURIComponent(stringifyPrimitive(r)):""};var isArray=Array.isArray||function(r){return"[object Array]"===Object.prototype.toString.call(r)},objectKeys=Object.keys||function(r){var e=[];for(var t in r)Object.prototype.hasOwnProperty.call(r,t)&&e.push(t);return e};


},{}],9:[function(require,module,exports){
"use strict";exports.decode=exports.parse=require("./decode"),exports.encode=exports.stringify=require("./encode");


},{"./decode":7,"./encode":8}],10:[function(require,module,exports){
function Url(){this.protocol=null,this.slashes=null,this.auth=null,this.host=null,this.port=null,this.hostname=null,this.hash=null,this.search=null,this.query=null,this.pathname=null,this.path=null,this.href=null}function urlParse(t,s,e){if(t&&isObject(t)&&t instanceof Url)return t;var h=new Url;return h.parse(t,s,e),h}function urlFormat(t){return isString(t)&&(t=urlParse(t)),t instanceof Url?t.format():Url.prototype.format.call(t)}function urlResolve(t,s){return urlParse(t,!1,!0).resolve(s)}function urlResolveObject(t,s){return t?urlParse(t,!1,!0).resolveObject(s):s}function isString(t){return"string"==typeof t}function isObject(t){return"object"==typeof t&&null!==t}function isNull(t){return null===t}function isNullOrUndefined(t){return null==t}var punycode=require("punycode");exports.parse=urlParse,exports.resolve=urlResolve,exports.resolveObject=urlResolveObject,exports.format=urlFormat,exports.Url=Url;var protocolPattern=/^([a-z0-9.+-]+:)/i,portPattern=/:[0-9]*$/,delims=["<",">",'"',"`"," ","\r","\n","	"],unwise=["{","}","|","\\","^","`"].concat(delims),autoEscape=["'"].concat(unwise),nonHostChars=["%","/","?",";","#"].concat(autoEscape),hostEndingChars=["/","?","#"],hostnameMaxLen=255,hostnamePartPattern=/^[a-z0-9A-Z_-]{0,63}$/,hostnamePartStart=/^([a-z0-9A-Z_-]{0,63})(.*)$/,unsafeProtocol={javascript:!0,"javascript:":!0},hostlessProtocol={javascript:!0,"javascript:":!0},slashedProtocol={http:!0,https:!0,ftp:!0,gopher:!0,file:!0,"http:":!0,"https:":!0,"ftp:":!0,"gopher:":!0,"file:":!0},querystring=require("querystring");Url.prototype.parse=function(t,s,e){if(!isString(t))throw new TypeError("Parameter 'url' must be a string, not "+typeof t);var h=t;h=h.trim();var r=protocolPattern.exec(h);if(r){r=r[0];var o=r.toLowerCase();this.protocol=o,h=h.substr(r.length)}if(e||r||h.match(/^\/\/[^@\/]+@[^@\/]+/)){var a="//"===h.substr(0,2);!a||r&&hostlessProtocol[r]||(h=h.substr(2),this.slashes=!0)}if(!hostlessProtocol[r]&&(a||r&&!slashedProtocol[r])){for(var n=-1,i=0;i<hostEndingChars.length;i++){var l=h.indexOf(hostEndingChars[i]);-1!==l&&(-1===n||n>l)&&(n=l)}var c,u;u=-1===n?h.lastIndexOf("@"):h.lastIndexOf("@",n),-1!==u&&(c=h.slice(0,u),h=h.slice(u+1),this.auth=decodeURIComponent(c)),n=-1;for(var i=0;i<nonHostChars.length;i++){var l=h.indexOf(nonHostChars[i]);-1!==l&&(-1===n||n>l)&&(n=l)}-1===n&&(n=h.length),this.host=h.slice(0,n),h=h.slice(n),this.parseHost(),this.hostname=this.hostname||"";var p="["===this.hostname[0]&&"]"===this.hostname[this.hostname.length-1];if(!p)for(var f=this.hostname.split(/\./),i=0,m=f.length;m>i;i++){var v=f[i];if(v&&!v.match(hostnamePartPattern)){for(var g="",y=0,d=v.length;d>y;y++)g+=v.charCodeAt(y)>127?"x":v[y];if(!g.match(hostnamePartPattern)){var P=f.slice(0,i),b=f.slice(i+1),j=v.match(hostnamePartStart);j&&(P.push(j[1]),b.unshift(j[2])),b.length&&(h="/"+b.join(".")+h),this.hostname=P.join(".");break}}}if(this.hostname.length>hostnameMaxLen?this.hostname="":this.hostname=this.hostname.toLowerCase(),!p){for(var O=this.hostname.split("."),q=[],i=0;i<O.length;++i){var x=O[i];q.push(x.match(/[^A-Za-z0-9_-]/)?"xn--"+punycode.encode(x):x)}this.hostname=q.join(".")}var U=this.port?":"+this.port:"",C=this.hostname||"";this.host=C+U,this.href+=this.host,p&&(this.hostname=this.hostname.substr(1,this.hostname.length-2),"/"!==h[0]&&(h="/"+h))}if(!unsafeProtocol[o])for(var i=0,m=autoEscape.length;m>i;i++){var A=autoEscape[i],E=encodeURIComponent(A);E===A&&(E=escape(A)),h=h.split(A).join(E)}var w=h.indexOf("#");-1!==w&&(this.hash=h.substr(w),h=h.slice(0,w));var R=h.indexOf("?");if(-1!==R?(this.search=h.substr(R),this.query=h.substr(R+1),s&&(this.query=querystring.parse(this.query)),h=h.slice(0,R)):s&&(this.search="",this.query={}),h&&(this.pathname=h),slashedProtocol[o]&&this.hostname&&!this.pathname&&(this.pathname="/"),this.pathname||this.search){var U=this.pathname||"",x=this.search||"";this.path=U+x}return this.href=this.format(),this},Url.prototype.format=function(){var t=this.auth||"";t&&(t=encodeURIComponent(t),t=t.replace(/%3A/i,":"),t+="@");var s=this.protocol||"",e=this.pathname||"",h=this.hash||"",r=!1,o="";this.host?r=t+this.host:this.hostname&&(r=t+(-1===this.hostname.indexOf(":")?this.hostname:"["+this.hostname+"]"),this.port&&(r+=":"+this.port)),this.query&&isObject(this.query)&&Object.keys(this.query).length&&(o=querystring.stringify(this.query));var a=this.search||o&&"?"+o||"";return s&&":"!==s.substr(-1)&&(s+=":"),this.slashes||(!s||slashedProtocol[s])&&r!==!1?(r="//"+(r||""),e&&"/"!==e.charAt(0)&&(e="/"+e)):r||(r=""),h&&"#"!==h.charAt(0)&&(h="#"+h),a&&"?"!==a.charAt(0)&&(a="?"+a),e=e.replace(/[?#]/g,function(t){return encodeURIComponent(t)}),a=a.replace("#","%23"),s+r+e+a+h},Url.prototype.resolve=function(t){return this.resolveObject(urlParse(t,!1,!0)).format()},Url.prototype.resolveObject=function(t){if(isString(t)){var s=new Url;s.parse(t,!1,!0),t=s}var e=new Url;if(Object.keys(this).forEach(function(t){e[t]=this[t]},this),e.hash=t.hash,""===t.href)return e.href=e.format(),e;if(t.slashes&&!t.protocol)return Object.keys(t).forEach(function(s){"protocol"!==s&&(e[s]=t[s])}),slashedProtocol[e.protocol]&&e.hostname&&!e.pathname&&(e.path=e.pathname="/"),e.href=e.format(),e;if(t.protocol&&t.protocol!==e.protocol){if(!slashedProtocol[t.protocol])return Object.keys(t).forEach(function(s){e[s]=t[s]}),e.href=e.format(),e;if(e.protocol=t.protocol,t.host||hostlessProtocol[t.protocol])e.pathname=t.pathname;else{for(var h=(t.pathname||"").split("/");h.length&&!(t.host=h.shift()););t.host||(t.host=""),t.hostname||(t.hostname=""),""!==h[0]&&h.unshift(""),h.length<2&&h.unshift(""),e.pathname=h.join("/")}if(e.search=t.search,e.query=t.query,e.host=t.host||"",e.auth=t.auth,e.hostname=t.hostname||t.host,e.port=t.port,e.pathname||e.search){var r=e.pathname||"",o=e.search||"";e.path=r+o}return e.slashes=e.slashes||t.slashes,e.href=e.format(),e}var a=e.pathname&&"/"===e.pathname.charAt(0),n=t.host||t.pathname&&"/"===t.pathname.charAt(0),i=n||a||e.host&&t.pathname,l=i,c=e.pathname&&e.pathname.split("/")||[],h=t.pathname&&t.pathname.split("/")||[],u=e.protocol&&!slashedProtocol[e.protocol];if(u&&(e.hostname="",e.port=null,e.host&&(""===c[0]?c[0]=e.host:c.unshift(e.host)),e.host="",t.protocol&&(t.hostname=null,t.port=null,t.host&&(""===h[0]?h[0]=t.host:h.unshift(t.host)),t.host=null),i=i&&(""===h[0]||""===c[0])),n)e.host=t.host||""===t.host?t.host:e.host,e.hostname=t.hostname||""===t.hostname?t.hostname:e.hostname,e.search=t.search,e.query=t.query,c=h;else if(h.length)c||(c=[]),c.pop(),c=c.concat(h),e.search=t.search,e.query=t.query;else if(!isNullOrUndefined(t.search)){if(u){e.hostname=e.host=c.shift();var p=e.host&&e.host.indexOf("@")>0?e.host.split("@"):!1;p&&(e.auth=p.shift(),e.host=e.hostname=p.shift())}return e.search=t.search,e.query=t.query,isNull(e.pathname)&&isNull(e.search)||(e.path=(e.pathname?e.pathname:"")+(e.search?e.search:"")),e.href=e.format(),e}if(!c.length)return e.pathname=null,e.search?e.path="/"+e.search:e.path=null,e.href=e.format(),e;for(var f=c.slice(-1)[0],m=(e.host||t.host)&&("."===f||".."===f)||""===f,v=0,g=c.length;g>=0;g--)f=c[g],"."==f?c.splice(g,1):".."===f?(c.splice(g,1),v++):v&&(c.splice(g,1),v--);if(!i&&!l)for(;v--;v)c.unshift("..");!i||""===c[0]||c[0]&&"/"===c[0].charAt(0)||c.unshift(""),m&&"/"!==c.join("/").substr(-1)&&c.push("");var y=""===c[0]||c[0]&&"/"===c[0].charAt(0);if(u){e.hostname=e.host=y?"":c.length?c.shift():"";var p=e.host&&e.host.indexOf("@")>0?e.host.split("@"):!1;p&&(e.auth=p.shift(),e.host=e.hostname=p.shift())}return i=i||e.host&&c.length,i&&!y&&c.unshift(""),c.length?e.pathname=c.join("/"):(e.pathname=null,e.path=null),isNull(e.pathname)&&isNull(e.search)||(e.path=(e.pathname?e.pathname:"")+(e.search?e.search:"")),e.auth=t.auth||e.auth,e.slashes=e.slashes||t.slashes,e.href=e.format(),e},Url.prototype.parseHost=function(){var t=this.host,s=portPattern.exec(t);s&&(s=s[0],":"!==s&&(this.port=s.substr(1)),t=t.substr(0,t.length-s.length)),t&&(this.hostname=t)};


},{"punycode":6,"querystring":9}],11:[function(require,module,exports){
"use strict";var _={cloneDeep:require("lodash-compat/lang/cloneDeep"),each:require("lodash-compat/collection/each"),indexOf:require("lodash-compat/array/indexOf"),isArray:require("lodash-compat/lang/isArray"),isFunction:require("lodash-compat/lang/isFunction"),isPlainObject:require("lodash-compat/lang/isPlainObject"),isString:require("lodash-compat/lang/isString"),isUndefined:require("lodash-compat/lang/isUndefined"),keys:require("lodash-compat/object/keys"),map:require("lodash-compat/collection/map")},async=require("async"),request=require("superagent"),traverse=require("traverse"),remoteCache={},supportedSchemes=["http","https"],getRemoteJson=function(e,r,t){var n,i,o=e.split("#")[0],s=remoteCache[o];_.isUndefined(s)?(i=request.get(e).set("user-agent","whitlockjc/json-refs"),_.isUndefined(r.prepareRequest)||r.prepareRequest(i,e),_.isFunction(i.buffer)&&i.buffer(!0),i.end(function(i,a){if(i)n=i;else if(a.error)n=a.error;else if(_.isUndefined(r.processContent))try{s=JSON.parse(a.text)}catch(u){n=u}else try{s=r.processContent(a.text,e,a)}catch(u){n=u}remoteCache[o]=s,t(n,s)})):t(n,s)};module.exports.clearCache=function(){remoteCache={}};var isJsonReference=module.exports.isJsonReference=function(e){return _.isPlainObject(e)&&_.isString(e.$ref)},pathToPointer=module.exports.pathToPointer=function(e){if(_.isUndefined(e))throw new Error("path is required");if(!_.isArray(e))throw new Error("path must be an array");var r="#";return e.length>0&&(r+="/"+_.map(e,function(e){return e.replace(/~/g,"~0").replace(/\//g,"~1")}).join("/")),r},findRefs=module.exports.findRefs=function(e){if(_.isUndefined(e))throw new Error("json is required");if(!_.isPlainObject(e))throw new Error("json must be an object");return traverse(e).reduce(function(e){var r=this.node;return"$ref"===this.key&&isJsonReference(this.parent.node)&&(e[pathToPointer(this.path)]=r),e},{})},isRemotePointer=module.exports.isRemotePointer=function(e){if(_.isUndefined(e))throw new Error("ptr is required");if(!_.isString(e))throw new Error("ptr must be a string");return/^(([a-zA-Z0-9+.-]+):\/\/|\.{1,2}\/)/.test(e)},pathFromPointer=module.exports.pathFromPointer=function(e){if(_.isUndefined(e))throw new Error("ptr is required");if(!_.isString(e))throw new Error("ptr must be a string");var r=[];return isRemotePointer(e)?r=e:"#"===e.charAt(0)&&"#"!==e&&(r=_.map(e.substring(1).split("/"),function(e){return e.replace(/~0/g,"~").replace(/~1/g,"/")}),r.length>1&&r.shift()),r},resolveRefs=module.exports.resolveRefs=function e(r,t,n){if(arguments.length<3&&(n=arguments[1],t={}),_.isUndefined(r))throw new Error("json is required");if(!_.isPlainObject(r))throw new Error("json must be an object");if(!_.isPlainObject(t))throw new Error("options must be an object");if(_.isUndefined(n))throw new Error("done is required");if(!_.isFunction(n))throw new Error("done must be a function");if(!_.isUndefined(t.prepareRequest)&&!_.isFunction(t.prepareRequest))throw new Error("options.prepareRequest must be a function");if(!_.isUndefined(t.processContent)&&!_.isFunction(t.processContent))throw new Error("options.processContent must be a function");var i,o=findRefs(r),s=function(e){return e.map(function(){this.circular&&this.update(traverse(this.node).map(function(){this.circular&&this.parent.remove()}))})},a={};if(Object.keys(o).length>0){i=traverse(_.cloneDeep(r));var u=function(e,r,t,n){var i,o,s,u={ref:t},c=!1;t=-1===t.indexOf("#")?"#":t.substring(t.indexOf("#")),o=pathFromPointer(n),i=o.slice(0,o.length-1),0===i.length?(c=!_.isUndefined(r.value),s=r.value,e.value=s):(c=!r.has(pathFromPointer(t)),s=r.get(pathFromPointer(t)),e.set(i,s)),c||(u.value=s),a[n]=u},c={};_.each(o,function(e,r){isRemotePointer(e)?c[r]=e:u(i,i,e,r)}),async.map(_.keys(c),function(r,n){var o=c[r],s=o.split(":")[0];"."===o.charAt(0)||-1===_.indexOf(supportedSchemes,s)?n():getRemoteJson(o,t,function(s,a){s?n(s):e(a,t,function(e,t){delete c[r],e?n(e):(u(i,traverse(t),o,r),n())})})},function(e){e?n(e):n(void 0,s(i),a)})}else n(void 0,r,a)};


},{"async":4,"lodash-compat/array/indexOf":12,"lodash-compat/collection/each":14,"lodash-compat/collection/map":16,"lodash-compat/lang/cloneDeep":67,"lodash-compat/lang/isArray":69,"lodash-compat/lang/isFunction":70,"lodash-compat/lang/isPlainObject":73,"lodash-compat/lang/isString":74,"lodash-compat/lang/isUndefined":76,"lodash-compat/object/keys":77,"superagent":86,"traverse":136}],12:[function(require,module,exports){
function indexOf(e,n,r){var a=e?e.length:0;if(!a)return-1;if("number"==typeof r)r=0>r?nativeMax(a+r,0):r;else if(r){var i=binaryIndex(e,n),t=e[i];return(n===n?n===t:t!==t)?i:-1}return baseIndexOf(e,n,r||0)}var baseIndexOf=require("../internal/baseIndexOf"),binaryIndex=require("../internal/binaryIndex"),nativeMax=Math.max;module.exports=indexOf;


},{"../internal/baseIndexOf":29,"../internal/binaryIndex":41}],13:[function(require,module,exports){
function last(t){var e=t?t.length:0;return e?t[e-1]:void 0}module.exports=last;


},{}],14:[function(require,module,exports){
module.exports=require("./forEach");


},{"./forEach":15}],15:[function(require,module,exports){
var arrayEach=require("../internal/arrayEach"),baseEach=require("../internal/baseEach"),createForEach=require("../internal/createForEach"),forEach=createForEach(arrayEach,baseEach);module.exports=forEach;


},{"../internal/arrayEach":18,"../internal/baseEach":24,"../internal/createForEach":47}],16:[function(require,module,exports){
function map(a,r,e){var i=isArray(a)?arrayMap:baseMap;return r=baseCallback(r,e,3),i(a,r)}var arrayMap=require("../internal/arrayMap"),baseCallback=require("../internal/baseCallback"),baseMap=require("../internal/baseMap"),isArray=require("../lang/isArray");module.exports=map;


},{"../internal/arrayMap":19,"../internal/baseCallback":21,"../internal/baseMap":34,"../lang/isArray":69}],17:[function(require,module,exports){
function arrayCopy(r,a){var o=-1,y=r.length;for(a||(a=Array(y));++o<y;)a[o]=r[o];return a}module.exports=arrayCopy;


},{}],18:[function(require,module,exports){
function arrayEach(r,a){for(var e=-1,n=r.length;++e<n&&a(r[e],e,r)!==!1;);return r}module.exports=arrayEach;


},{}],19:[function(require,module,exports){
function arrayMap(r,a){for(var e=-1,n=r.length,o=Array(n);++e<n;)o[e]=a(r[e],e,r);return o}module.exports=arrayMap;


},{}],20:[function(require,module,exports){
var baseCopy=require("./baseCopy"),getSymbols=require("./getSymbols"),isNative=require("../lang/isNative"),keys=require("../object/keys"),preventExtensions=isNative(Object.preventExtensions=Object.preventExtensions)&&preventExtensions,nativeAssign=function(){var e={1:0},s=preventExtensions&&isNative(s=Object.assign)&&s;try{s(preventExtensions(e),"xo")}catch(n){}return!e[1]&&s}(),baseAssign=nativeAssign||function(e,s){return null==s?e:baseCopy(s,getSymbols(s),baseCopy(s,keys(s),e))};module.exports=baseAssign;


},{"../lang/isNative":71,"../object/keys":77,"./baseCopy":23,"./getSymbols":52}],21:[function(require,module,exports){
function baseCallback(e,t,r){var a=typeof e;return"function"==a?void 0===t?e:bindCallback(e,t,r):null==e?identity:"object"==a?baseMatches(e):void 0===t?property(e):baseMatchesProperty(e,t)}var baseMatches=require("./baseMatches"),baseMatchesProperty=require("./baseMatchesProperty"),bindCallback=require("./bindCallback"),identity=require("../utility/identity"),property=require("../utility/property");module.exports=baseCallback;


},{"../utility/identity":82,"../utility/property":83,"./baseMatches":35,"./baseMatchesProperty":36,"./bindCallback":43}],22:[function(require,module,exports){
function baseClone(a,e,r,t,o,n,g){var l;if(r&&(l=o?r(a,t,o):r(a)),void 0!==l)return l;if(!isObject(a))return a;var b=isArray(a);if(b){if(l=initCloneArray(a),!e)return arrayCopy(a,l)}else{var T=objToString.call(a),i=T==funcTag;if(T!=objectTag&&T!=argsTag&&(!i||o))return cloneableTags[T]?initCloneByTag(a,T,e):o?a:{};if(isHostObject(a))return o?a:{};if(l=initCloneObject(i?{}:a),!e)return baseAssign(l,a)}n||(n=[]),g||(g=[]);for(var c=n.length;c--;)if(n[c]==a)return g[c];return n.push(a),g.push(l),(b?arrayEach:baseForOwn)(a,function(t,o){l[o]=baseClone(t,e,r,o,a,n,g)}),l}var arrayCopy=require("./arrayCopy"),arrayEach=require("./arrayEach"),baseAssign=require("./baseAssign"),baseForOwn=require("./baseForOwn"),initCloneArray=require("./initCloneArray"),initCloneByTag=require("./initCloneByTag"),initCloneObject=require("./initCloneObject"),isArray=require("../lang/isArray"),isHostObject=require("./isHostObject"),isObject=require("../lang/isObject"),argsTag="[object Arguments]",arrayTag="[object Array]",boolTag="[object Boolean]",dateTag="[object Date]",errorTag="[object Error]",funcTag="[object Function]",mapTag="[object Map]",numberTag="[object Number]",objectTag="[object Object]",regexpTag="[object RegExp]",setTag="[object Set]",stringTag="[object String]",weakMapTag="[object WeakMap]",arrayBufferTag="[object ArrayBuffer]",float32Tag="[object Float32Array]",float64Tag="[object Float64Array]",int8Tag="[object Int8Array]",int16Tag="[object Int16Array]",int32Tag="[object Int32Array]",uint8Tag="[object Uint8Array]",uint8ClampedTag="[object Uint8ClampedArray]",uint16Tag="[object Uint16Array]",uint32Tag="[object Uint32Array]",cloneableTags={};cloneableTags[argsTag]=cloneableTags[arrayTag]=cloneableTags[arrayBufferTag]=cloneableTags[boolTag]=cloneableTags[dateTag]=cloneableTags[float32Tag]=cloneableTags[float64Tag]=cloneableTags[int8Tag]=cloneableTags[int16Tag]=cloneableTags[int32Tag]=cloneableTags[numberTag]=cloneableTags[objectTag]=cloneableTags[regexpTag]=cloneableTags[stringTag]=cloneableTags[uint8Tag]=cloneableTags[uint8ClampedTag]=cloneableTags[uint16Tag]=cloneableTags[uint32Tag]=!0,cloneableTags[errorTag]=cloneableTags[funcTag]=cloneableTags[mapTag]=cloneableTags[setTag]=cloneableTags[weakMapTag]=!1;var objectProto=Object.prototype,objToString=objectProto.toString;module.exports=baseClone;


},{"../lang/isArray":69,"../lang/isObject":72,"./arrayCopy":17,"./arrayEach":18,"./baseAssign":20,"./baseForOwn":27,"./initCloneArray":54,"./initCloneByTag":55,"./initCloneObject":56,"./isHostObject":57}],23:[function(require,module,exports){
function baseCopy(e,o,r){r||(r={});for(var a=-1,n=o.length;++a<n;){var t=o[a];r[t]=e[t]}return r}module.exports=baseCopy;


},{}],24:[function(require,module,exports){
var baseForOwn=require("./baseForOwn"),createBaseEach=require("./createBaseEach"),baseEach=createBaseEach(baseForOwn);module.exports=baseEach;


},{"./baseForOwn":27,"./createBaseEach":45}],25:[function(require,module,exports){
var createBaseFor=require("./createBaseFor"),baseFor=createBaseFor();module.exports=baseFor;


},{"./createBaseFor":46}],26:[function(require,module,exports){
function baseForIn(e,r){return baseFor(e,r,keysIn)}var baseFor=require("./baseFor"),keysIn=require("../object/keysIn");module.exports=baseForIn;


},{"../object/keysIn":78,"./baseFor":25}],27:[function(require,module,exports){
function baseForOwn(e,r){return baseFor(e,r,keys)}var baseFor=require("./baseFor"),keys=require("../object/keys");module.exports=baseForOwn;


},{"../object/keys":77,"./baseFor":25}],28:[function(require,module,exports){
function baseGet(e,t,o){if(null!=e){e=toObject(e),void 0!==o&&o in e&&(t=[o]);for(var r=-1,n=t.length;null!=e&&++r<n;)var b=e=toObject(e)[t[r]];return b}}var toObject=require("./toObject");module.exports=baseGet;


},{"./toObject":65}],29:[function(require,module,exports){
function baseIndexOf(e,r,n){if(r!==r)return indexOfNaN(e,n);for(var f=n-1,a=e.length;++f<a;)if(e[f]===r)return f;return-1}var indexOfNaN=require("./indexOfNaN");module.exports=baseIndexOf;


},{"./indexOfNaN":53}],30:[function(require,module,exports){
function baseIsEqual(e,u,a,s,l,n){if(e===u)return 0!==e||1/e==1/u;var t=typeof e,o=typeof u;return"function"!=t&&"object"!=t&&"function"!=o&&"object"!=o||null==e||null==u?e!==e&&u!==u:baseIsEqualDeep(e,u,baseIsEqual,a,s,l,n)}var baseIsEqualDeep=require("./baseIsEqualDeep");module.exports=baseIsEqual;


},{"./baseIsEqualDeep":31}],31:[function(require,module,exports){
function baseIsEqualDeep(r,e,a,t,o,s,u){var i=isArray(r),b=isArray(e),c=arrayTag,g=arrayTag;i||(c=objToString.call(r),c==argsTag?c=objectTag:c!=objectTag&&(i=isTypedArray(r))),b||(g=objToString.call(e),g==argsTag?g=objectTag:g!=objectTag&&(b=isTypedArray(e)));var y=c==objectTag&&!isHostObject(r),j=g==objectTag&&!isHostObject(e),l=c==g;if(l&&!i&&!y)return equalByTag(r,e,c);if(!o){var p=y&&hasOwnProperty.call(r,"__wrapped__"),T=j&&hasOwnProperty.call(e,"__wrapped__");if(p||T)return a(p?r.value():r,T?e.value():e,t,o,s,u)}if(!l)return!1;s||(s=[]),u||(u=[]);for(var n=s.length;n--;)if(s[n]==r)return u[n]==e;s.push(r),u.push(e);var q=(i?equalArrays:equalObjects)(r,e,a,t,o,s,u);return s.pop(),u.pop(),q}var equalArrays=require("./equalArrays"),equalByTag=require("./equalByTag"),equalObjects=require("./equalObjects"),isArray=require("../lang/isArray"),isHostObject=require("./isHostObject"),isTypedArray=require("../lang/isTypedArray"),argsTag="[object Arguments]",arrayTag="[object Array]",objectTag="[object Object]",objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty,objToString=objectProto.toString;module.exports=baseIsEqualDeep;


},{"../lang/isArray":69,"../lang/isTypedArray":75,"./equalArrays":48,"./equalByTag":49,"./equalObjects":50,"./isHostObject":57}],32:[function(require,module,exports){
function baseIsFunction(n){return"function"==typeof n||!1}module.exports=baseIsFunction;


},{}],33:[function(require,module,exports){
function baseIsMatch(e,r,a,s,i){for(var u=-1,n=r.length,o=!i;++u<n;)if(o&&s[u]?a[u]!==e[r[u]]:!(r[u]in e))return!1;for(u=-1;++u<n;){var t=r[u],v=e[t],f=a[u];if(o&&s[u])var l=void 0!==v||t in e;else l=i?i(v,f,t):void 0,void 0===l&&(l=baseIsEqual(f,v,i,!0));if(!l)return!1}return!0}var baseIsEqual=require("./baseIsEqual");module.exports=baseIsMatch;


},{"./baseIsEqual":30}],34:[function(require,module,exports){
function baseMap(e,a){var r=-1,t=getLength(e),n=isLength(t)?Array(t):[];return baseEach(e,function(e,t,g){n[++r]=a(e,t,g)}),n}var baseEach=require("./baseEach"),getLength=require("./getLength"),isLength=require("./isLength");module.exports=baseMap;


},{"./baseEach":24,"./getLength":51,"./isLength":60}],35:[function(require,module,exports){
function baseMatches(t){var r=keys(t),e=r.length;if(!e)return constant(!0);if(1==e){var a=r[0],i=t[a];if(isStrictComparable(i))return function(t){return null==t?!1:(t=toObject(t),t[a]===i&&(void 0!==i||a in t))}}for(var n=Array(e),s=Array(e);e--;)i=t[r[e]],n[e]=i,s[e]=isStrictComparable(i);return function(t){return null!=t&&baseIsMatch(toObject(t),r,n,s)}}var baseIsMatch=require("./baseIsMatch"),constant=require("../utility/constant"),isStrictComparable=require("./isStrictComparable"),keys=require("../object/keys"),toObject=require("./toObject");module.exports=baseMatches;


},{"../object/keys":77,"../utility/constant":81,"./baseIsMatch":33,"./isStrictComparable":62,"./toObject":65}],36:[function(require,module,exports){
function baseMatchesProperty(e,r){var t=isArray(e),a=isKey(e)&&isStrictComparable(r),i=e+"";return e=toPath(e),function(s){if(null==s)return!1;var u=i;if(s=toObject(s),!(!t&&a||u in s)){if(s=1==e.length?s:baseGet(s,baseSlice(e,0,-1)),null==s)return!1;u=last(e),s=toObject(s)}return s[u]===r?void 0!==r||u in s:baseIsEqual(r,s[u],null,!0)}}var baseGet=require("./baseGet"),baseIsEqual=require("./baseIsEqual"),baseSlice=require("./baseSlice"),isArray=require("../lang/isArray"),isKey=require("./isKey"),isStrictComparable=require("./isStrictComparable"),last=require("../array/last"),toObject=require("./toObject"),toPath=require("./toPath");module.exports=baseMatchesProperty;


},{"../array/last":13,"../lang/isArray":69,"./baseGet":28,"./baseIsEqual":30,"./baseSlice":39,"./isKey":59,"./isStrictComparable":62,"./toObject":65,"./toPath":66}],37:[function(require,module,exports){
function baseProperty(e){return function(t){return null==t?void 0:toObject(t)[e]}}var toObject=require("./toObject");module.exports=baseProperty;


},{"./toObject":65}],38:[function(require,module,exports){
function basePropertyDeep(e){var t=e+"";return e=toPath(e),function(r){return baseGet(r,e,t)}}var baseGet=require("./baseGet"),toPath=require("./toPath");module.exports=basePropertyDeep;


},{"./baseGet":28,"./toPath":66}],39:[function(require,module,exports){
function baseSlice(e,r,l){var a=-1,n=e.length;r=null==r?0:+r||0,0>r&&(r=-r>n?0:n+r),l=void 0===l||l>n?n:+l||0,0>l&&(l+=n),n=r>l?0:l-r>>>0,r>>>=0;for(var o=Array(n);++a<n;)o[a]=e[a+r];return o}module.exports=baseSlice;


},{}],40:[function(require,module,exports){
function baseToString(n){return"string"==typeof n?n:null==n?"":n+""}module.exports=baseToString;


},{}],41:[function(require,module,exports){
function binaryIndex(e,n,r){var i=0,t=e?e.length:i;if("number"==typeof n&&n===n&&HALF_MAX_ARRAY_LENGTH>=t){for(;t>i;){var A=i+t>>>1,y=e[A];(r?n>=y:n>y)?i=A+1:t=A}return t}return binaryIndexBy(e,n,identity,r)}var binaryIndexBy=require("./binaryIndexBy"),identity=require("../utility/identity"),MAX_ARRAY_LENGTH=Math.pow(2,32)-1,HALF_MAX_ARRAY_LENGTH=MAX_ARRAY_LENGTH>>>1;module.exports=binaryIndex;


},{"../utility/identity":82,"./binaryIndexBy":42}],42:[function(require,module,exports){
function binaryIndexBy(n,o,r,A){o=r(o);for(var a=0,i=n?n.length:0,e=o!==o,t=void 0===o;i>a;){var M=floor((a+i)/2),v=r(n[M]),R=v===v;if(e)var _=R||A;else _=t?R&&(A||void 0!==v):A?o>=v:o>v;_?a=M+1:i=M}return nativeMin(i,MAX_ARRAY_INDEX)}var floor=Math.floor,nativeMin=Math.min,MAX_ARRAY_LENGTH=Math.pow(2,32)-1,MAX_ARRAY_INDEX=MAX_ARRAY_LENGTH-1;module.exports=binaryIndexBy;


},{}],43:[function(require,module,exports){
function bindCallback(n,t,r){if("function"!=typeof n)return identity;if(void 0===t)return n;switch(r){case 1:return function(r){return n.call(t,r)};case 3:return function(r,e,u){return n.call(t,r,e,u)};case 4:return function(r,e,u,i){return n.call(t,r,e,u,i)};case 5:return function(r,e,u,i,c){return n.call(t,r,e,u,i,c)}}return function(){return n.apply(t,arguments)}}var identity=require("../utility/identity");module.exports=bindCallback;


},{"../utility/identity":82}],44:[function(require,module,exports){
(function (global){
function bufferClone(r){return bufferSlice.call(r,0)}var constant=require("../utility/constant"),isNative=require("../lang/isNative"),ArrayBuffer=isNative(ArrayBuffer=global.ArrayBuffer)&&ArrayBuffer,bufferSlice=isNative(bufferSlice=ArrayBuffer&&new ArrayBuffer(0).slice)&&bufferSlice,floor=Math.floor,Uint8Array=isNative(Uint8Array=global.Uint8Array)&&Uint8Array,Float64Array=function(){try{var r=isNative(r=global.Float64Array)&&r,e=new r(new ArrayBuffer(10),0,1)&&r}catch(a){}return e}(),FLOAT64_BYTES_PER_ELEMENT=Float64Array?Float64Array.BYTES_PER_ELEMENT:0;bufferSlice||(bufferClone=ArrayBuffer&&Uint8Array?function(r){var e=r.byteLength,a=Float64Array?floor(e/FLOAT64_BYTES_PER_ELEMENT):0,t=a*FLOAT64_BYTES_PER_ELEMENT,f=new ArrayBuffer(e);if(a){var n=new Float64Array(f,0,a);n.set(new Float64Array(r,0,a))}return e!=t&&(n=new Uint8Array(f,t),n.set(new Uint8Array(r,t))),f}:constant(null)),module.exports=bufferClone;


}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../lang/isNative":71,"../utility/constant":81}],45:[function(require,module,exports){
function createBaseEach(e,t){return function(r,n){var a=r?getLength(r):0;if(!isLength(a))return e(r,n);for(var c=t?a:-1,g=toObject(r);(t?c--:++c<a)&&n(g[c],c,g)!==!1;);return r}}var getLength=require("./getLength"),isLength=require("./isLength"),toObject=require("./toObject");module.exports=createBaseEach;


},{"./getLength":51,"./isLength":60,"./toObject":65}],46:[function(require,module,exports){
function createBaseFor(e){return function(r,t,o){for(var a=toObject(r),c=o(r),n=c.length,u=e?n:-1;e?u--:++u<n;){var b=c[u];if(t(a[b],b,a)===!1)break}return r}}var toObject=require("./toObject");module.exports=createBaseFor;


},{"./toObject":65}],47:[function(require,module,exports){
function createForEach(r,a){return function(e,i,n){return"function"==typeof i&&void 0===n&&isArray(e)?r(e,i):a(e,bindCallback(i,n,3))}}var bindCallback=require("./bindCallback"),isArray=require("../lang/isArray");module.exports=createForEach;


},{"../lang/isArray":69,"./bindCallback":43}],48:[function(require,module,exports){
function equalArrays(r,e,a,o,f,i,l){var n=-1,t=r.length,u=e.length,v=!0;if(t!=u&&!(f&&u>t))return!1;for(;v&&++n<t;){var s=r[n],d=e[n];if(v=void 0,o&&(v=f?o(d,s,n):o(s,d,n)),void 0===v)if(f)for(var g=u;g--&&(d=e[g],!(v=s&&s===d||a(s,d,o,f,i,l))););else v=s&&s===d||a(s,d,o,f,i,l)}return!!v}module.exports=equalArrays;


},{}],49:[function(require,module,exports){
function equalByTag(e,a,r){switch(r){case boolTag:case dateTag:return+e==+a;case errorTag:return e.name==a.name&&e.message==a.message;case numberTag:return e!=+e?a!=+a:0==e?1/e==1/a:e==+a;case regexpTag:case stringTag:return e==a+""}return!1}var boolTag="[object Boolean]",dateTag="[object Date]",errorTag="[object Error]",numberTag="[object Number]",regexpTag="[object RegExp]",stringTag="[object String]";module.exports=equalByTag;


},{}],50:[function(require,module,exports){
function equalObjects(r,t,o,e,n,c,s){var i=keys(r),u=i.length,a=keys(t),f=a.length;if(u!=f&&!n)return!1;for(var y=n,p=-1;++p<u;){var v=i[p],l=n?v in t:hasOwnProperty.call(t,v);if(l){var b=r[v],j=t[v];l=void 0,e&&(l=n?e(j,b,v):e(b,j,v)),void 0===l&&(l=b&&b===j||o(b,j,e,n,c,s))}if(!l)return!1;y||(y="constructor"==v)}if(!y){var O=r.constructor,h=t.constructor;if(O!=h&&"constructor"in r&&"constructor"in t&&!("function"==typeof O&&O instanceof O&&"function"==typeof h&&h instanceof h))return!1}return!0}var keys=require("../object/keys"),objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty;module.exports=equalObjects;


},{"../object/keys":77}],51:[function(require,module,exports){
var baseProperty=require("./baseProperty"),getLength=baseProperty("length");module.exports=getLength;


},{"./baseProperty":37}],52:[function(require,module,exports){
var constant=require("../utility/constant"),isNative=require("../lang/isNative"),toObject=require("./toObject"),getOwnPropertySymbols=isNative(getOwnPropertySymbols=Object.getOwnPropertySymbols)&&getOwnPropertySymbols,getSymbols=getOwnPropertySymbols?function(t){return getOwnPropertySymbols(toObject(t))}:constant([]);module.exports=getSymbols;


},{"../lang/isNative":71,"../utility/constant":81,"./toObject":65}],53:[function(require,module,exports){
function indexOfNaN(r,e,n){for(var f=r.length,t=e+(n?0:-1);n?t--:++t<f;){var a=r[t];if(a!==a)return t}return-1}module.exports=indexOfNaN;


},{}],54:[function(require,module,exports){
function initCloneArray(t){var r=t.length,n=new t.constructor(r);return r&&"string"==typeof t[0]&&hasOwnProperty.call(t,"index")&&(n.index=t.index,n.input=t.input),n}var objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty;module.exports=initCloneArray;


},{}],55:[function(require,module,exports){
(function (global){
function initCloneByTag(a,t,r){var e=a.constructor;switch(t){case arrayBufferTag:return bufferClone(a);case boolTag:case dateTag:return new e(+a);case float32Tag:case float64Tag:case int8Tag:case int16Tag:case int32Tag:case uint8Tag:case uint8ClampedTag:case uint16Tag:case uint32Tag:e instanceof e&&(e=ctorByTag[t]);var g=a.buffer;return new e(r?bufferClone(g):g,a.byteOffset,a.length);case numberTag:case stringTag:return new e(a);case regexpTag:var n=new e(a.source,reFlags.exec(a));n.lastIndex=a.lastIndex}return n}var bufferClone=require("./bufferClone"),boolTag="[object Boolean]",dateTag="[object Date]",numberTag="[object Number]",regexpTag="[object RegExp]",stringTag="[object String]",arrayBufferTag="[object ArrayBuffer]",float32Tag="[object Float32Array]",float64Tag="[object Float64Array]",int8Tag="[object Int8Array]",int16Tag="[object Int16Array]",int32Tag="[object Int32Array]",uint8Tag="[object Uint8Array]",uint8ClampedTag="[object Uint8ClampedArray]",uint16Tag="[object Uint16Array]",uint32Tag="[object Uint32Array]",reFlags=/\w*$/,ctorByTag={};ctorByTag[float32Tag]=global.Float32Array,ctorByTag[float64Tag]=global.Float64Array,ctorByTag[int8Tag]=global.Int8Array,ctorByTag[int16Tag]=global.Int16Array,ctorByTag[int32Tag]=global.Int32Array,ctorByTag[uint8Tag]=global.Uint8Array,ctorByTag[uint8ClampedTag]=global.Uint8ClampedArray,ctorByTag[uint16Tag]=global.Uint16Array,ctorByTag[uint32Tag]=global.Uint32Array,module.exports=initCloneByTag;


}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./bufferClone":44}],56:[function(require,module,exports){
function initCloneObject(n){var t=n.constructor;return"function"==typeof t&&t instanceof t||(t=Object),new t}module.exports=initCloneObject;


},{}],57:[function(require,module,exports){
var isHostObject=function(){try{Object({toString:0}+"")}catch(t){return function(){return!1}}return function(t){return"function"!=typeof t.toString&&"string"==typeof(t+"")}}();module.exports=isHostObject;


},{}],58:[function(require,module,exports){
function isIndex(n,E){return n=+n,E=null==E?MAX_SAFE_INTEGER:E,n>-1&&n%1==0&&E>n}var MAX_SAFE_INTEGER=Math.pow(2,53)-1;module.exports=isIndex;


},{}],59:[function(require,module,exports){
function isKey(r,e){var t=typeof r;if("string"==t&&reIsPlainProp.test(r)||"number"==t)return!0;if(isArray(r))return!1;var i=!reIsDeepProp.test(r);return i||null!=e&&r in toObject(e)}var isArray=require("../lang/isArray"),toObject=require("./toObject"),reIsDeepProp=/\.|\[(?:[^[\]]+|(["'])(?:(?!\1)[^\n\\]|\\.)*?)\1\]/,reIsPlainProp=/^\w*$/;module.exports=isKey;


},{"../lang/isArray":69,"./toObject":65}],60:[function(require,module,exports){
function isLength(e){return"number"==typeof e&&e>-1&&e%1==0&&MAX_SAFE_INTEGER>=e}var MAX_SAFE_INTEGER=Math.pow(2,53)-1;module.exports=isLength;


},{}],61:[function(require,module,exports){
function isObjectLike(e){return!!e&&"object"==typeof e}module.exports=isObjectLike;


},{}],62:[function(require,module,exports){
function isStrictComparable(e){return e===e&&(0===e?1/e>0:!isObject(e))}var isObject=require("../lang/isObject");module.exports=isStrictComparable;


},{"../lang/isObject":72}],63:[function(require,module,exports){
function shimIsPlainObject(t){var r;if(!isObjectLike(t)||objToString.call(t)!=objectTag||isHostObject(t)||!hasOwnProperty.call(t,"constructor")&&(r=t.constructor,"function"==typeof r&&!(r instanceof r))||!support.argsTag&&isArguments(t))return!1;var e;return support.ownLast?(baseForIn(t,function(t,r,o){return e=hasOwnProperty.call(o,r),!1}),e!==!1):(baseForIn(t,function(t,r){e=r}),void 0===e||hasOwnProperty.call(t,e))}var baseForIn=require("./baseForIn"),isArguments=require("../lang/isArguments"),isHostObject=require("./isHostObject"),isObjectLike=require("./isObjectLike"),support=require("../support"),objectTag="[object Object]",objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty,objToString=objectProto.toString;module.exports=shimIsPlainObject;


},{"../lang/isArguments":68,"../support":80,"./baseForIn":26,"./isHostObject":57,"./isObjectLike":61}],64:[function(require,module,exports){
function shimKeys(r){for(var e=keysIn(r),s=e.length,n=s&&r.length,t=n&&isLength(n)&&(isArray(r)||support.nonEnumStrings&&isString(r)||support.nonEnumArgs&&isArguments(r)),i=-1,o=[];++i<s;){var u=e[i];(t&&isIndex(u,n)||hasOwnProperty.call(r,u))&&o.push(u)}return o}var isArguments=require("../lang/isArguments"),isArray=require("../lang/isArray"),isIndex=require("./isIndex"),isLength=require("./isLength"),isString=require("../lang/isString"),keysIn=require("../object/keysIn"),support=require("../support"),objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty;module.exports=shimKeys;


},{"../lang/isArguments":68,"../lang/isArray":69,"../lang/isString":74,"../object/keysIn":78,"../support":80,"./isIndex":58,"./isLength":60}],65:[function(require,module,exports){
function toObject(r){if(support.unindexedChars&&isString(r)){for(var t=-1,e=r.length,i=Object(r);++t<e;)i[t]=r.charAt(t);return i}return isObject(r)?r:Object(r)}var isObject=require("../lang/isObject"),isString=require("../lang/isString"),support=require("../support");module.exports=toObject;


},{"../lang/isObject":72,"../lang/isString":74,"../support":80}],66:[function(require,module,exports){
function toPath(r){if(isArray(r))return r;var e=[];return baseToString(r).replace(rePropName,function(r,a,t,i){e.push(t?i.replace(reEscapeChar,"$1"):a||r)}),e}var baseToString=require("./baseToString"),isArray=require("../lang/isArray"),rePropName=/[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\n\\]|\\.)*?)\2)\]/g,reEscapeChar=/\\(\\)?/g;module.exports=toPath;


},{"../lang/isArray":69,"./baseToString":40}],67:[function(require,module,exports){
function cloneDeep(e,n,l){return n="function"==typeof n&&bindCallback(n,l,1),baseClone(e,!0,n)}var baseClone=require("../internal/baseClone"),bindCallback=require("../internal/bindCallback");module.exports=cloneDeep;


},{"../internal/baseClone":22,"../internal/bindCallback":43}],68:[function(require,module,exports){
function isArguments(e){var r=isObjectLike(e)?e.length:void 0;return isLength(r)&&objToString.call(e)==argsTag}var isLength=require("../internal/isLength"),isObjectLike=require("../internal/isObjectLike"),support=require("../support"),argsTag="[object Arguments]",objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty,objToString=objectProto.toString,propertyIsEnumerable=objectProto.propertyIsEnumerable;support.argsTag||(isArguments=function(e){var r=isObjectLike(e)?e.length:void 0;return isLength(r)&&hasOwnProperty.call(e,"callee")&&!propertyIsEnumerable.call(e,"callee")}),module.exports=isArguments;


},{"../internal/isLength":60,"../internal/isObjectLike":61,"../support":80}],69:[function(require,module,exports){
var isLength=require("../internal/isLength"),isNative=require("./isNative"),isObjectLike=require("../internal/isObjectLike"),arrayTag="[object Array]",objectProto=Object.prototype,objToString=objectProto.toString,nativeIsArray=isNative(nativeIsArray=Array.isArray)&&nativeIsArray,isArray=nativeIsArray||function(r){return isObjectLike(r)&&isLength(r.length)&&objToString.call(r)==arrayTag};module.exports=isArray;


},{"../internal/isLength":60,"../internal/isObjectLike":61,"./isNative":71}],70:[function(require,module,exports){
(function (global){
var baseIsFunction=require("../internal/baseIsFunction"),isNative=require("./isNative"),funcTag="[object Function]",objectProto=Object.prototype,objToString=objectProto.toString,Uint8Array=isNative(Uint8Array=global.Uint8Array)&&Uint8Array,isFunction=baseIsFunction(/x/)||Uint8Array&&!baseIsFunction(Uint8Array)?function(t){return objToString.call(t)==funcTag}:baseIsFunction;module.exports=isFunction;


}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../internal/baseIsFunction":32,"./isNative":71}],71:[function(require,module,exports){
function isNative(t){return null==t?!1:objToString.call(t)==funcTag?reIsNative.test(fnToString.call(t)):isObjectLike(t)&&(isHostObject(t)?reIsNative:reIsHostCtor).test(t)}var escapeRegExp=require("../string/escapeRegExp"),isHostObject=require("../internal/isHostObject"),isObjectLike=require("../internal/isObjectLike"),funcTag="[object Function]",reIsHostCtor=/^\[object .+?Constructor\]$/,objectProto=Object.prototype,fnToString=Function.prototype.toString,objToString=objectProto.toString,reIsNative=RegExp("^"+escapeRegExp(objToString).replace(/toString|(function).*?(?=\\\()| for .+?(?=\\\])/g,"$1.*?")+"$");module.exports=isNative;


},{"../internal/isHostObject":57,"../internal/isObjectLike":61,"../string/escapeRegExp":79}],72:[function(require,module,exports){
function isObject(t){var e=typeof t;return"function"==e||!!t&&"object"==e}module.exports=isObject;


},{}],73:[function(require,module,exports){
var isArguments=require("./isArguments"),isNative=require("./isNative"),shimIsPlainObject=require("../internal/shimIsPlainObject"),support=require("../support"),objectTag="[object Object]",objectProto=Object.prototype,objToString=objectProto.toString,getPrototypeOf=isNative(getPrototypeOf=Object.getPrototypeOf)&&getPrototypeOf,isPlainObject=getPrototypeOf?function(t){if(!t||objToString.call(t)!=objectTag||!support.argsTag&&isArguments(t))return!1;var e=t.valueOf,o=isNative(e)&&(o=getPrototypeOf(e))&&getPrototypeOf(o);return o?t==o||getPrototypeOf(t)==o:shimIsPlainObject(t)}:shimIsPlainObject;module.exports=isPlainObject;


},{"../internal/shimIsPlainObject":63,"../support":80,"./isArguments":68,"./isNative":71}],74:[function(require,module,exports){
function isString(t){return"string"==typeof t||isObjectLike(t)&&objToString.call(t)==stringTag}var isObjectLike=require("../internal/isObjectLike"),stringTag="[object String]",objectProto=Object.prototype,objToString=objectProto.toString;module.exports=isString;


},{"../internal/isObjectLike":61}],75:[function(require,module,exports){
function isTypedArray(a){return isObjectLike(a)&&isLength(a.length)&&!!typedArrayTags[objToString.call(a)]}var isLength=require("../internal/isLength"),isObjectLike=require("../internal/isObjectLike"),argsTag="[object Arguments]",arrayTag="[object Array]",boolTag="[object Boolean]",dateTag="[object Date]",errorTag="[object Error]",funcTag="[object Function]",mapTag="[object Map]",numberTag="[object Number]",objectTag="[object Object]",regexpTag="[object RegExp]",setTag="[object Set]",stringTag="[object String]",weakMapTag="[object WeakMap]",arrayBufferTag="[object ArrayBuffer]",float32Tag="[object Float32Array]",float64Tag="[object Float64Array]",int8Tag="[object Int8Array]",int16Tag="[object Int16Array]",int32Tag="[object Int32Array]",uint8Tag="[object Uint8Array]",uint8ClampedTag="[object Uint8ClampedArray]",uint16Tag="[object Uint16Array]",uint32Tag="[object Uint32Array]",typedArrayTags={};typedArrayTags[float32Tag]=typedArrayTags[float64Tag]=typedArrayTags[int8Tag]=typedArrayTags[int16Tag]=typedArrayTags[int32Tag]=typedArrayTags[uint8Tag]=typedArrayTags[uint8ClampedTag]=typedArrayTags[uint16Tag]=typedArrayTags[uint32Tag]=!0,typedArrayTags[argsTag]=typedArrayTags[arrayTag]=typedArrayTags[arrayBufferTag]=typedArrayTags[boolTag]=typedArrayTags[dateTag]=typedArrayTags[errorTag]=typedArrayTags[funcTag]=typedArrayTags[mapTag]=typedArrayTags[numberTag]=typedArrayTags[objectTag]=typedArrayTags[regexpTag]=typedArrayTags[setTag]=typedArrayTags[stringTag]=typedArrayTags[weakMapTag]=!1;var objectProto=Object.prototype,objToString=objectProto.toString;module.exports=isTypedArray;


},{"../internal/isLength":60,"../internal/isObjectLike":61}],76:[function(require,module,exports){
function isUndefined(e){return void 0===e}module.exports=isUndefined;


},{}],77:[function(require,module,exports){
var isLength=require("../internal/isLength"),isNative=require("../lang/isNative"),isObject=require("../lang/isObject"),shimKeys=require("../internal/shimKeys"),support=require("../support"),nativeKeys=isNative(nativeKeys=Object.keys)&&nativeKeys,keys=nativeKeys?function(e){if(e)var t=e.constructor,i=e.length;return"function"==typeof t&&t.prototype===e||("function"==typeof e?support.enumPrototypes:isLength(i))?shimKeys(e):isObject(e)?nativeKeys(e):[]}:shimKeys;module.exports=keys;


},{"../internal/isLength":60,"../internal/shimKeys":64,"../lang/isNative":71,"../lang/isObject":72,"../support":80}],78:[function(require,module,exports){
function keysIn(r){if(null==r)return[];isObject(r)||(r=Object(r));var o=r.length;o=o&&isLength(o)&&(isArray(r)||support.nonEnumStrings&&isString(r)||support.nonEnumArgs&&isArguments(r))&&o||0;for(var n=r.constructor,t=-1,e=isFunction(n)&&n.prototype||objectProto,s=e===r,a=Array(o),i=o>0,u=support.enumErrorProps&&(r===errorProto||r instanceof Error),p=support.enumPrototypes&&isFunction(r);++t<o;)a[t]=t+"";for(var g in r)p&&"prototype"==g||u&&("message"==g||"name"==g)||i&&isIndex(g,o)||"constructor"==g&&(s||!hasOwnProperty.call(r,g))||a.push(g);if(support.nonEnumShadows&&r!==objectProto){var c=r===stringProto?stringTag:r===errorProto?errorTag:objToString.call(r),P=nonEnumProps[c]||nonEnumProps[objectTag];for(c==objectTag&&(e=objectProto),o=shadowProps.length;o--;){g=shadowProps[o];var b=P[g];s&&b||(b?!hasOwnProperty.call(r,g):r[g]===e[g])||a.push(g)}}return a}var arrayEach=require("../internal/arrayEach"),isArguments=require("../lang/isArguments"),isArray=require("../lang/isArray"),isFunction=require("../lang/isFunction"),isIndex=require("../internal/isIndex"),isLength=require("../internal/isLength"),isObject=require("../lang/isObject"),isString=require("../lang/isString"),support=require("../support"),arrayTag="[object Array]",boolTag="[object Boolean]",dateTag="[object Date]",errorTag="[object Error]",funcTag="[object Function]",numberTag="[object Number]",objectTag="[object Object]",regexpTag="[object RegExp]",stringTag="[object String]",shadowProps=["constructor","hasOwnProperty","isPrototypeOf","propertyIsEnumerable","toLocaleString","toString","valueOf"],errorProto=Error.prototype,objectProto=Object.prototype,stringProto=String.prototype,hasOwnProperty=objectProto.hasOwnProperty,objToString=objectProto.toString,nonEnumProps={};nonEnumProps[arrayTag]=nonEnumProps[dateTag]=nonEnumProps[numberTag]={constructor:!0,toLocaleString:!0,toString:!0,valueOf:!0},nonEnumProps[boolTag]=nonEnumProps[stringTag]={constructor:!0,toString:!0,valueOf:!0},nonEnumProps[errorTag]=nonEnumProps[funcTag]=nonEnumProps[regexpTag]={constructor:!0,toString:!0},nonEnumProps[objectTag]={constructor:!0},arrayEach(shadowProps,function(r){for(var o in nonEnumProps)if(hasOwnProperty.call(nonEnumProps,o)){var n=nonEnumProps[o];n[r]=hasOwnProperty.call(n,r)}}),module.exports=keysIn;


},{"../internal/arrayEach":18,"../internal/isIndex":58,"../internal/isLength":60,"../lang/isArguments":68,"../lang/isArray":69,"../lang/isFunction":70,"../lang/isObject":72,"../lang/isString":74,"../support":80}],79:[function(require,module,exports){
function escapeRegExp(e){return e=baseToString(e),e&&reHasRegExpChars.test(e)?e.replace(reRegExpChars,"\\$&"):e}var baseToString=require("../internal/baseToString"),reRegExpChars=/[.*+?^${}()|[\]\/\\]/g,reHasRegExpChars=RegExp(reRegExpChars.source);module.exports=escapeRegExp;


},{"../internal/baseToString":40}],80:[function(require,module,exports){
(function (global){
var argsTag="[object Arguments]",objectTag="[object Object]",arrayProto=Array.prototype,errorProto=Error.prototype,objectProto=Object.prototype,document=(document=global.window)&&document.document,objToString=objectProto.toString,propertyIsEnumerable=objectProto.propertyIsEnumerable,splice=arrayProto.splice,support={};!function(o){var r=function(){this.x=o},t={0:o,length:o},e=[];r.prototype={valueOf:o,y:o};for(var p in new r)e.push(p);support.argsTag=objToString.call(arguments)==argsTag,support.enumErrorProps=propertyIsEnumerable.call(errorProto,"message")||propertyIsEnumerable.call(errorProto,"name"),support.enumPrototypes=propertyIsEnumerable.call(r,"prototype"),support.funcDecomp=/\bthis\b/.test(function(){return this}),support.funcNames="string"==typeof Function.name,support.nodeTag=objToString.call(document)!=objectTag,support.nonEnumStrings=!propertyIsEnumerable.call("x",0),support.nonEnumShadows=!/valueOf/.test(e),support.ownLast="x"!=e[0],support.spliceObjects=(splice.call(t,0,1),!t[0]),support.unindexedChars="x"[0]+Object("x")[0]!="xx";try{support.dom=11===document.createDocumentFragment().nodeType}catch(n){support.dom=!1}try{support.nonEnumArgs=!propertyIsEnumerable.call(arguments,1)}catch(n){support.nonEnumArgs=!0}}(1,0),module.exports=support;


}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],81:[function(require,module,exports){
function constant(n){return function(){return n}}module.exports=constant;


},{}],82:[function(require,module,exports){
function identity(t){return t}module.exports=identity;


},{}],83:[function(require,module,exports){
function property(e){return isKey(e)?baseProperty(e):basePropertyDeep(e)}var baseProperty=require("../internal/baseProperty"),basePropertyDeep=require("../internal/basePropertyDeep"),isKey=require("../internal/isKey");module.exports=property;


},{"../internal/baseProperty":37,"../internal/basePropertyDeep":38,"../internal/isKey":59}],84:[function(require,module,exports){
(function (global){
(function(){function n(n,t){if(n!==t){var r=n===n,e=t===t;if(n>t||!r||n===x&&e)return 1;if(t>n||!e||t===x&&r)return-1}return 0}function t(n,t,r){for(var e=n.length,u=r?e:-1;r?u--:++u<e;)if(t(n[u],u,n))return u;return-1}function r(n,t,r){if(t!==t)return h(n,r);for(var e=r-1,u=n.length;++e<u;)if(n[e]===t)return e;return-1}function e(n){return"function"==typeof n||!1}function u(n){return"string"==typeof n?n:null==n?"":n+""}function i(n){return n.charCodeAt(0)}function o(n,t){for(var r=-1,e=n.length;++r<e&&t.indexOf(n.charAt(r))>-1;);return r}function a(n,t){for(var r=n.length;r--&&t.indexOf(n.charAt(r))>-1;);return r}function f(t,r){return n(t.criteria,r.criteria)||t.index-r.index}function c(t,r,e){for(var u=-1,i=t.criteria,o=r.criteria,a=i.length,f=e.length;++u<a;){var c=n(i[u],o[u]);if(c)return u>=f?c:c*(e[u]?1:-1)}return t.index-r.index}function l(n){return Mn[n]}function s(n){return qn[n]}function p(n){return"\\"+Yn[n]}function h(n,t,r){for(var e=n.length,u=t+(r?0:-1);r?u--:++u<e;){var i=n[u];if(i!==i)return u}return-1}function v(n){return!!n&&"object"==typeof n}function _(n){return 160>=n&&n>=9&&13>=n||32==n||160==n||5760==n||6158==n||n>=8192&&(8202>=n||8232==n||8233==n||8239==n||8287==n||12288==n||65279==n)}function g(n,t){for(var r=-1,e=n.length,u=-1,i=[];++r<e;)n[r]===t&&(n[r]=D,i[++u]=r);return i}function y(n,t){for(var r,e=-1,u=n.length,i=-1,o=[];++e<u;){var a=n[e],f=t?t(a,e,n):a;e&&r===f||(r=f,o[++i]=a)}return o}function d(n){for(var t=-1,r=n.length;++t<r&&_(n.charCodeAt(t)););return t}function m(n){for(var t=n.length;t--&&_(n.charCodeAt(t)););return t}function w(n){return Kn[n]}function b(_){function G(n){if(v(n)&&!Aa(n)&&!(n instanceof Mn)){if(n instanceof nn)return n;if(zi.call(n,"__chain__")&&zi.call(n,"__wrapped__"))return ue(n)}return new nn(n)}function H(){}function nn(n,t,r){this.__wrapped__=n,this.__actions__=r||[],this.__chain__=!!t}function Mn(n){this.__wrapped__=n,this.__actions__=null,this.__dir__=1,this.__dropCount__=0,this.__filtered__=!1,this.__iteratees__=null,this.__takeCount__=wo,this.__views__=null}function qn(){var n=this.__actions__,t=this.__iteratees__,r=this.__views__,e=new Mn(this.__wrapped__);return e.__actions__=n?et(n):null,e.__dir__=this.__dir__,e.__filtered__=this.__filtered__,e.__iteratees__=t?et(t):null,e.__takeCount__=this.__takeCount__,e.__views__=r?et(r):null,e}function Kn(){if(this.__filtered__){var n=new Mn(this);n.__dir__=-1,n.__filtered__=!0}else n=this.clone(),n.__dir__*=-1;return n}function Vn(){var n=this.__wrapped__.value();if(!Aa(n))return tr(n,this.__actions__);var t=this.__dir__,r=0>t,e=Lr(0,n.length,this.__views__),u=e.start,i=e.end,o=i-u,a=r?i:u-1,f=ho(o,this.__takeCount__),c=this.__iteratees__,l=c?c.length:0,s=0,p=[];n:for(;o--&&f>s;){a+=t;for(var h=-1,v=n[a];++h<l;){var _=c[h],g=_.iteratee,y=_.type;if(y==$){if(_.done&&(r?a>_.index:a<_.index)&&(_.count=0,_.done=!1),_.index=a,!_.done){var d=_.limit;if(!(_.done=d>-1?_.count++>=d:!g(v)))continue n}}else{var m=g(v);if(y==B)v=m;else if(!m){if(y==L)continue n;break n}}}p[s++]=v}return p}function Yn(){this.__data__={}}function Gn(n){return this.has(n)&&delete this.__data__[n]}function Jn(n){return"__proto__"==n?x:this.__data__[n]}function Xn(n){return"__proto__"!=n&&zi.call(this.__data__,n)}function Zn(n,t){return"__proto__"!=n&&(this.__data__[n]=t),this}function Hn(n){var t=n?n.length:0;for(this.data={hash:co(null),set:new to};t--;)this.push(n[t])}function Qn(n,t){var r=n.data,e="string"==typeof t||bu(t)?r.set.has(t):r.hash[t];return e?0:-1}function rt(n){var t=this.data;"string"==typeof n||bu(n)?t.set.add(n):t.hash[n]=!0}function et(n,t){var r=-1,e=n.length;for(t||(t=Oi(e));++r<e;)t[r]=n[r];return t}function ut(n,t){for(var r=-1,e=n.length;++r<e&&t(n[r],r,n)!==!1;);return n}function it(n,t){for(var r=n.length;r--&&t(n[r],r,n)!==!1;);return n}function ot(n,t){for(var r=-1,e=n.length;++r<e;)if(!t(n[r],r,n))return!1;return!0}function at(n,t){for(var r=-1,e=n.length,u=-1,i=[];++r<e;){var o=n[r];t(o,r,n)&&(i[++u]=o)}return i}function ft(n,t){for(var r=-1,e=n.length,u=Oi(e);++r<e;)u[r]=t(n[r],r,n);return u}function ct(n){for(var t=-1,r=n.length,e=mo;++t<r;){var u=n[t];u>e&&(e=u)}return e}function lt(n){for(var t=-1,r=n.length,e=wo;++t<r;){var u=n[t];e>u&&(e=u)}return e}function st(n,t,r,e){var u=-1,i=n.length;for(e&&i&&(r=n[++u]);++u<i;)r=t(r,n[u],u,n);return r}function pt(n,t,r,e){var u=n.length;for(e&&u&&(r=n[--u]);u--;)r=t(r,n[u],u,n);return r}function ht(n,t){for(var r=-1,e=n.length;++r<e;)if(t(n[r],r,n))return!0;return!1}function vt(n){for(var t=n.length,r=0;t--;)r+=+n[t]||0;return r}function _t(n,t){return n===x?t:n}function gt(n,t,r,e){return n!==x&&zi.call(e,r)?n:t}function yt(n,t,r){var e=Na(t);Hi.apply(e,zo(t));for(var u=-1,i=e.length;++u<i;){var o=e[u],a=n[o],f=r(a,t[o],o,n,t);(f===f?f===a:a!==a)&&(a!==x||o in n)||(n[o]=f)}return n}function dt(n,t){for(var r=-1,e=n.length,u=Yr(e),i=t.length,o=Oi(i);++r<i;){var a=t[r];u?o[r]=Mr(a,e)?n[a]:x:o[r]=n[a]}return o}function mt(n,t,r){r||(r={});for(var e=-1,u=t.length;++e<u;){var i=t[e];r[i]=n[i]}return r}function wt(n,t,r){var e=typeof n;return"function"==e?t===x?n:ur(n,t,r):null==n?pi:"object"==e?Lt(n):t===x?di(n):Bt(n,t)}function bt(n,t,r,e,u,i,o){var a;if(r&&(a=u?r(n,e,u):r(n)),a!==x)return a;if(!bu(n))return n;var f=Aa(n);if(f){if(a=Br(n),!t)return et(n,a)}else{var c=Pi.call(n),l=c==Y;if(c!=X&&c!=P&&(!l||u))return Dn[c]?Dr(n,c,t):u?n:{};if(a=zr(l?{}:n),!t)return ko(a,n)}i||(i=[]),o||(o=[]);for(var s=i.length;s--;)if(i[s]==n)return o[s];return i.push(n),o.push(a),(f?ut:Ct)(n,function(e,u){a[u]=bt(e,t,r,u,n,i,o)}),a}function xt(n,t,r){if("function"!=typeof n)throw new Wi(z);return ro(function(){n.apply(x,r)},t)}function At(n,t){var e=n?n.length:0,u=[];if(!e)return u;var i=-1,o=$r(),a=o==r,f=a&&t.length>=200?Fo(t):null,c=t.length;f&&(o=Qn,a=!1,t=f);n:for(;++i<e;){var l=n[i];if(a&&l===l){for(var s=c;s--;)if(t[s]===l)continue n;u.push(l)}else o(t,l,0)<0&&u.push(l)}return u}function jt(n,t){var r=!0;return So(n,function(n,e,u){return r=!!t(n,e,u)}),r}function Ot(n,t,r,e){var u=n.length;for(r=null==r?0:+r||0,0>r&&(r=-r>u?0:u+r),e=e===x||e>u?u:+e||0,0>e&&(e+=u),u=r>e?0:e>>>0,r>>>=0;u>r;)n[r++]=t;return n}function Et(n,t){var r=[];return So(n,function(n,e,u){t(n,e,u)&&r.push(n)}),r}function It(n,t,r,e){var u;return r(n,function(n,r,i){return t(n,r,i)?(u=e?r:n,!1):void 0}),u}function Rt(n,t,r){for(var e=-1,u=n.length,i=-1,o=[];++e<u;){var a=n[e];if(v(a)&&Yr(a.length)&&(Aa(a)||vu(a))){t&&(a=Rt(a,t,r));var f=-1,c=a.length;for(o.length+=c;++f<c;)o[++i]=a[f]}else r||(o[++i]=a)}return o}function kt(n,t){return Uo(n,t,Lu)}function Ct(n,t){return Uo(n,t,Na)}function St(n,t){return Wo(n,t,Na)}function Tt(n,t){for(var r=-1,e=t.length,u=-1,i=[];++r<e;){var o=t[r];Oa(n[o])&&(i[++u]=o)}return i}function Ut(n,t,r){if(null!=n){r!==x&&r in re(n)&&(t=[r]);for(var e=-1,u=t.length;null!=n&&++e<u;)var i=n=n[t[e]];return i}}function Wt(n,t,r,e,u,i){if(n===t)return 0!==n||1/n==1/t;var o=typeof n,a=typeof t;return"function"!=o&&"object"!=o&&"function"!=a&&"object"!=a||null==n||null==t?n!==n&&t!==t:Nt(n,t,Wt,r,e,u,i)}function Nt(n,t,r,e,u,i,o){var a=Aa(n),f=Aa(t),c=M,l=M;a||(c=Pi.call(n),c==P?c=X:c!=X&&(a=ku(n))),f||(l=Pi.call(t),l==P?l=X:l!=X&&(f=ku(t)));var s=c==X,p=l==X,h=c==l;if(h&&!a&&!s)return Ur(n,t,c);if(!u){var v=s&&zi.call(n,"__wrapped__"),_=p&&zi.call(t,"__wrapped__");if(v||_)return r(v?n.value():n,_?t.value():t,e,u,i,o)}if(!h)return!1;i||(i=[]),o||(o=[]);for(var g=i.length;g--;)if(i[g]==n)return o[g]==t;i.push(n),o.push(t);var y=(a?Tr:Wr)(n,t,r,e,u,i,o);return i.pop(),o.pop(),y}function Ft(n,t,r,e,u){for(var i=-1,o=t.length,a=!u;++i<o;)if(a&&e[i]?r[i]!==n[t[i]]:!(t[i]in n))return!1;for(i=-1;++i<o;){var f=t[i],c=n[f],l=r[i];if(a&&e[i])var s=c!==x||f in n;else s=u?u(c,l,f):x,s===x&&(s=Wt(l,c,u,!0));if(!s)return!1}return!0}function $t(n,t){var r=-1,e=Bo(n),u=Yr(e)?Oi(e):[];return So(n,function(n,e,i){u[++r]=t(n,e,i)}),u}function Lt(n){var t=Na(n),r=t.length;if(!r)return si(!0);if(1==r){var e=t[0],u=n[e];if(Gr(u))return function(n){return null==n?!1:n[e]===u&&(u!==x||e in re(n))}}for(var i=Oi(r),o=Oi(r);r--;)u=n[t[r]],i[r]=u,o[r]=Gr(u);return function(n){return null!=n&&Ft(re(n),t,i,o)}}function Bt(n,t){var r=Aa(n),e=Kr(n)&&Gr(t),u=n+"";return n=ee(n),function(i){if(null==i)return!1;var o=u;if(i=re(i),!(!r&&e||o in i)){if(i=1==n.length?i:Ut(i,Yt(n,0,-1)),null==i)return!1;o=de(n),i=re(i)}return i[o]===t?t!==x||o in i:Wt(t,i[o],null,!0)}}function zt(n,t,r,e,u){if(!bu(n))return n;var i=Yr(t.length)&&(Aa(t)||ku(t));if(!i){var o=Na(t);Hi.apply(o,zo(t))}return ut(o||t,function(a,f){if(o&&(f=a,a=t[f]),v(a))e||(e=[]),u||(u=[]),Dt(n,t,f,zt,r,e,u);else{var c=n[f],l=r?r(c,a,f,n,t):x,s=l===x;s&&(l=a),!i&&l===x||!s&&(l===l?l===c:c!==c)||(n[f]=l)}}),n}function Dt(n,t,r,e,u,i,o){for(var a=i.length,f=t[r];a--;)if(i[a]==f)return void(n[r]=o[a]);var c=n[r],l=u?u(c,f,r,n,t):x,s=l===x;s&&(l=f,Yr(f.length)&&(Aa(f)||ku(f))?l=Aa(c)?c:Bo(c)?et(c):[]:Ea(f)||vu(f)?l=vu(c)?Tu(c):Ea(c)?c:{}:s=!1),i.push(f),o.push(l),s?n[r]=e(l,f,u,i,o):(l===l?l!==c:c===c)&&(n[r]=l)}function Pt(n){return function(t){return null==t?x:t[n]}}function Mt(n){var t=n+"";return n=ee(n),function(r){return Ut(r,n,t)}}function qt(n,t){for(var r=t.length;r--;){var e=parseFloat(t[r]);if(e!=u&&Mr(e)){var u=e;eo.call(n,e,1)}}return n}function Kt(n,t){return n+Ji(yo()*(t-n+1))}function Vt(n,t,r,e,u){return u(n,function(n,u,i){r=e?(e=!1,n):t(r,n,u,i)}),r}function Yt(n,t,r){var e=-1,u=n.length;t=null==t?0:+t||0,0>t&&(t=-t>u?0:u+t),r=r===x||r>u?u:+r||0,0>r&&(r+=u),u=t>r?0:r-t>>>0,t>>>=0;for(var i=Oi(u);++e<u;)i[e]=n[e+t];return i}function Gt(n,t){var r;return So(n,function(n,e,u){return r=t(n,e,u),!r}),!!r}function Jt(n,t){var r=n.length;for(n.sort(t);r--;)n[r]=n[r].value;return n}function Xt(n,t,r){var e=Fr(),u=-1;t=ft(t,function(n){return e(n)});var i=$t(n,function(n){var r=ft(t,function(t){return t(n)});return{criteria:r,index:++u,value:n}});return Jt(i,function(n,t){return c(n,t,r)})}function Zt(n,t){var r=0;return So(n,function(n,e,u){r+=+t(n,e,u)||0}),r}function Ht(n,t){var e=-1,u=$r(),i=n.length,o=u==r,a=o&&i>=200,f=a?Fo():null,c=[];f?(u=Qn,o=!1):(a=!1,f=t?[]:c);n:for(;++e<i;){var l=n[e],s=t?t(l,e,n):l;if(o&&l===l){for(var p=f.length;p--;)if(f[p]===s)continue n;t&&f.push(s),c.push(l)}else u(f,s,0)<0&&((t||a)&&f.push(s),c.push(l))}return c}function Qt(n,t){for(var r=-1,e=t.length,u=Oi(e);++r<e;)u[r]=n[t[r]];return u}function nr(n,t,r,e){for(var u=n.length,i=e?u:-1;(e?i--:++i<u)&&t(n[i],i,n););return r?Yt(n,e?0:i,e?i+1:u):Yt(n,e?i+1:0,e?u:i)}function tr(n,t){var r=n;r instanceof Mn&&(r=r.value());for(var e=-1,u=t.length;++e<u;){var i=[r],o=t[e];Hi.apply(i,o.args),r=o.func.apply(o.thisArg,i)}return r}function rr(n,t,r){var e=0,u=n?n.length:e;if("number"==typeof t&&t===t&&Ao>=u){for(;u>e;){var i=e+u>>>1,o=n[i];(r?t>=o:t>o)?e=i+1:u=i}return u}return er(n,t,pi,r)}function er(n,t,r,e){t=r(t);for(var u=0,i=n?n.length:0,o=t!==t,a=t===x;i>u;){var f=Ji((u+i)/2),c=r(n[f]),l=c===c;if(o)var s=l||e;else s=a?l&&(e||c!==x):e?t>=c:t>c;s?u=f+1:i=f}return ho(i,xo)}function ur(n,t,r){if("function"!=typeof n)return pi;if(t===x)return n;switch(r){case 1:return function(r){return n.call(t,r)};case 3:return function(r,e,u){return n.call(t,r,e,u)};case 4:return function(r,e,u,i){return n.call(t,r,e,u,i)};case 5:return function(r,e,u,i,o){return n.call(t,r,e,u,i,o)}}return function(){return n.apply(t,arguments)}}function ir(n){return Vi.call(n,0)}function or(n,t,r){for(var e=r.length,u=-1,i=po(n.length-e,0),o=-1,a=t.length,f=Oi(i+a);++o<a;)f[o]=t[o];for(;++u<e;)f[r[u]]=n[u];for(;i--;)f[o++]=n[u++];return f}function ar(n,t,r){for(var e=-1,u=r.length,i=-1,o=po(n.length-u,0),a=-1,f=t.length,c=Oi(o+f);++i<o;)c[i]=n[i];for(var l=i;++a<f;)c[l+a]=t[a];for(;++e<u;)c[l+r[e]]=n[i++];return c}function fr(n,t){return function(r,e,u){var i=t?t():{};if(e=Fr(e,u,3),Aa(r))for(var o=-1,a=r.length;++o<a;){var f=r[o];n(i,f,e(f,o,r),r)}else So(r,function(t,r,u){n(i,t,e(t,r,u),u)});return i}}function cr(n){return fu(function(t,r){var e=-1,u=null==t?0:r.length,i=u>2&&r[u-2],o=u>2&&r[2],a=u>1&&r[u-1];for("function"==typeof i?(i=ur(i,a,5),u-=2):(i="function"==typeof a?a:null,u-=i?1:0),o&&qr(r[0],r[1],o)&&(i=3>u?null:i,u=1);++e<u;){var f=r[e];f&&n(t,f,i)}return t})}function lr(n,t){return function(r,e){var u=r?Bo(r):0;if(!Yr(u))return n(r,e);for(var i=t?u:-1,o=re(r);(t?i--:++i<u)&&e(o[i],i,o)!==!1;);return r}}function sr(n){return function(t,r,e){for(var u=re(t),i=e(t),o=i.length,a=n?o:-1;n?a--:++a<o;){var f=i[a];if(r(u[f],f,u)===!1)break}return t}}function pr(n,t){function r(){var u=this&&this!==nt&&this instanceof r?e:n;return u.apply(t,arguments)}var e=vr(n);return r}function hr(n){return function(t){for(var r=-1,e=ci(Ju(t)),u=e.length,i="";++r<u;)i=n(i,e[r],r);return i}}function vr(n){return function(){var t=Co(n.prototype),r=n.apply(t,arguments);return bu(r)?r:t}}function _r(n){function t(r,e,u){u&&qr(r,e,u)&&(e=null);var i=Sr(r,n,null,null,null,null,null,e);return i.placeholder=t.placeholder,i}return t}function gr(n,t){return function(r,e,u){u&&qr(r,e,u)&&(e=null);var o=Fr(),a=null==e;if(o===wt&&a||(a=!1,e=o(e,u,3)),a){var f=Aa(r);if(f||!Ru(r))return n(f?r:te(r));e=i}return Nr(r,e,t)}}function yr(n,r){return function(e,u,i){if(u=Fr(u,i,3),Aa(e)){var o=t(e,u,r);return o>-1?e[o]:x}return It(e,u,n)}}function dr(n){return function(r,e,u){return r&&r.length?(e=Fr(e,u,3),t(r,e,n)):-1}}function mr(n){return function(t,r,e){return r=Fr(r,e,3),It(t,r,n,!0)}}function wr(n){return function(){var t=arguments.length;if(!t)return function(){return arguments[0]};for(var r,e=n?t:-1,u=0,i=Oi(t);n?e--:++e<t;){var o=i[u++]=arguments[e];if("function"!=typeof o)throw new Wi(z);var a=r?"":Lo(o);r="wrapper"==a?new nn([]):r}for(e=r?-1:t;++e<t;){o=i[e],a=Lo(o);var f="wrapper"==a?$o(o):null;r=f&&Vr(f[0])?r[Lo(f[0])].apply(r,f[3]):1==o.length&&Vr(o)?r[a]():r.thru(o)}return function(){var n=arguments;if(r&&1==n.length&&Aa(n[0]))return r.plant(n[0]).value();for(var e=0,u=i[e].apply(this,n);++e<t;)u=i[e].call(this,u);return u}}}function br(n,t){return function(r,e,u){return"function"==typeof e&&u===x&&Aa(r)?n(r,e):t(r,ur(e,u,3))}}function xr(n){return function(t,r,e){return("function"!=typeof r||e!==x)&&(r=ur(r,e,3)),n(t,r,Lu)}}function Ar(n){return function(t,r,e){return("function"!=typeof r||e!==x)&&(r=ur(r,e,3)),n(t,r)}}function jr(n){return function(t,r,e){return t=u(t),t&&(n?t:"")+Rr(t,r,e)+(n?"":t)}}function Or(n){var t=fu(function(r,e){var u=g(e,t.placeholder);return Sr(r,n,null,e,u)});return t}function Er(n,t){return function(r,e,u,i){var o=arguments.length<3;return"function"==typeof e&&i===x&&Aa(r)?n(r,e,u,o):Vt(r,Fr(e,i,4),u,o,t)}}function Ir(n,t,r,e,u,i,o,a,f,c){function l(){for(var w=arguments.length,b=w,A=Oi(w);b--;)A[b]=arguments[b];if(e&&(A=or(A,e,u)),i&&(A=ar(A,i,o)),v||y){var E=l.placeholder,I=g(A,E);if(w-=I.length,c>w){var R=a?et(a):null,S=po(c-w,0),T=v?I:null,U=v?null:I,W=v?A:null,N=v?null:A;t|=v?k:C,t&=~(v?C:k),_||(t&=~(j|O));var F=[n,t,r,W,T,N,U,R,f,S],$=Ir.apply(x,F);return Vr(n)&&Do($,F),$.placeholder=E,$}}var L=p?r:this;h&&(n=L[m]),a&&(A=Hr(A,a)),s&&f<A.length&&(A.length=f);var B=this&&this!==nt&&this instanceof l?d||vr(n):n;return B.apply(L,A)}var s=t&S,p=t&j,h=t&O,v=t&I,_=t&E,y=t&R,d=!h&&vr(n),m=n;return l}function Rr(n,t,r){var e=n.length;if(t=+t,e>=t||!lo(t))return"";var u=t-e;return r=null==r?" ":r+"",ti(r,Yi(u/r.length)).slice(0,u)}function kr(n,t,r,e){function u(){for(var t=-1,a=arguments.length,f=-1,c=e.length,l=Oi(a+c);++f<c;)l[f]=e[f];for(;a--;)l[f++]=arguments[++t];var s=this&&this!==nt&&this instanceof u?o:n;return s.apply(i?r:this,l)}var i=t&j,o=vr(n);return u}function Cr(n){return function(t,r,e,u){var i=Fr(e);return i===wt&&null==e?rr(t,r,n):er(t,r,i(e,u,1),n)}}function Sr(n,t,r,e,u,i,o,a){var f=t&O;if(!f&&"function"!=typeof n)throw new Wi(z);var c=e?e.length:0;if(c||(t&=~(k|C),e=u=null),c-=u?u.length:0,t&C){var l=e,s=u;e=u=null}var p=f?null:$o(n),h=[n,t,r,e,u,l,s,i,o,a];if(p&&(Jr(h,p),t=h[1],a=h[9]),h[9]=null==a?f?0:n.length:po(a-c,0)||0,t==j)var v=pr(h[0],h[2]);else v=t!=k&&t!=(j|k)||h[4].length?Ir.apply(x,h):kr.apply(x,h);var _=p?No:Do;return _(v,h)}function Tr(n,t,r,e,u,i,o){var a=-1,f=n.length,c=t.length,l=!0;if(f!=c&&!(u&&c>f))return!1;for(;l&&++a<f;){var s=n[a],p=t[a];if(l=x,e&&(l=u?e(p,s,a):e(s,p,a)),l===x)if(u)for(var h=c;h--&&(p=t[h],!(l=s&&s===p||r(s,p,e,u,i,o))););else l=s&&s===p||r(s,p,e,u,i,o)}return!!l}function Ur(n,t,r){switch(r){case q:case K:return+n==+t;case V:return n.name==t.name&&n.message==t.message;case J:return n!=+n?t!=+t:0==n?1/n==1/t:n==+t;case Z:case Q:return n==t+""}return!1}function Wr(n,t,r,e,u,i,o){var a=Na(n),f=a.length,c=Na(t),l=c.length;if(f!=l&&!u)return!1;for(var s=u,p=-1;++p<f;){var h=a[p],v=u?h in t:zi.call(t,h);if(v){var _=n[h],g=t[h];v=x,e&&(v=u?e(g,_,h):e(_,g,h)),v===x&&(v=_&&_===g||r(_,g,e,u,i,o))}if(!v)return!1;s||(s="constructor"==h)}if(!s){var y=n.constructor,d=t.constructor;if(y!=d&&"constructor"in n&&"constructor"in t&&!("function"==typeof y&&y instanceof y&&"function"==typeof d&&d instanceof d))return!1}return!0}function Nr(n,t,r){var e=r?wo:mo,u=e,i=u;return So(n,function(n,o,a){var f=t(n,o,a);((r?u>f:f>u)||f===e&&f===i)&&(u=f,i=n)}),i}function Fr(n,t,r){var e=G.callback||li;return e=e===li?wt:e,r?e(n,t,r):e}function $r(n,t,e){var u=G.indexOf||_e;return u=u===_e?r:u,n?u(n,t,e):u}function Lr(n,t,r){for(var e=-1,u=r?r.length:0;++e<u;){var i=r[e],o=i.size;switch(i.type){case"drop":n+=o;break;case"dropRight":t-=o;break;case"take":t=ho(t,n+o);break;case"takeRight":n=po(n,t-o)}}return{start:n,end:t}}function Br(n){var t=n.length,r=new n.constructor(t);return t&&"string"==typeof n[0]&&zi.call(n,"index")&&(r.index=n.index,r.input=n.input),r}function zr(n){var t=n.constructor;return"function"==typeof t&&t instanceof t||(t=Si),new t}function Dr(n,t,r){var e=n.constructor;switch(t){case tn:return ir(n);case q:case K:return new e(+n);case rn:case en:case un:case on:case an:case fn:case cn:case ln:case sn:var u=n.buffer;return new e(r?ir(u):u,n.byteOffset,n.length);case J:case Q:return new e(n);case Z:var i=new e(n.source,Cn.exec(n));i.lastIndex=n.lastIndex}return i}function Pr(n,t,r){null==n||Kr(t,n)||(t=ee(t),n=1==t.length?n:Ut(n,Yt(t,0,-1)),t=de(t));var e=null==n?n:n[t];return null==e?x:e.apply(n,r)}function Mr(n,t){return n=+n,t=null==t?Oo:t,n>-1&&n%1==0&&t>n}function qr(n,t,r){if(!bu(r))return!1;var e=typeof t;if("number"==e)var u=Bo(r),i=Yr(u)&&Mr(t,u);else i="string"==e&&t in r;if(i){var o=r[t];return n===n?n===o:o!==o}return!1}function Kr(n,t){var r=typeof n;if("string"==r&&An.test(n)||"number"==r)return!0;if(Aa(n))return!1;var e=!xn.test(n);return e||null!=t&&n in re(t)}function Vr(n){var t=Lo(n);return!!t&&n===G[t]&&t in Mn.prototype}function Yr(n){return"number"==typeof n&&n>-1&&n%1==0&&Oo>=n}function Gr(n){return n===n&&(0===n?1/n>0:!bu(n))}function Jr(n,t){var r=n[1],e=t[1],u=r|e,i=S>u,o=e==S&&r==I||e==S&&r==T&&n[7].length<=t[8]||e==(S|T)&&r==I;if(!i&&!o)return n;e&j&&(n[2]=t[2],u|=r&j?0:E);var a=t[3];if(a){var f=n[3];n[3]=f?or(f,a,t[4]):et(a),n[4]=f?g(n[3],D):et(t[4])}return a=t[5],a&&(f=n[5],n[5]=f?ar(f,a,t[6]):et(a),n[6]=f?g(n[5],D):et(t[6])),a=t[7],a&&(n[7]=et(a)),e&S&&(n[8]=null==n[8]?t[8]:ho(n[8],t[8])),null==n[9]&&(n[9]=t[9]),n[0]=t[0],n[1]=u,n}function Xr(n,t){n=re(n);for(var r=-1,e=t.length,u={};++r<e;){var i=t[r];i in n&&(u[i]=n[i])}return u}function Zr(n,t){var r={};return kt(n,function(n,e,u){t(n,e,u)&&(r[e]=n)}),r}function Hr(n,t){for(var r=n.length,e=ho(t.length,r),u=et(n);e--;){var i=t[e];n[e]=Mr(i,r)?u[i]:x}return n}function Qr(n){{var t;G.support}if(!v(n)||Pi.call(n)!=X||!zi.call(n,"constructor")&&(t=n.constructor,"function"==typeof t&&!(t instanceof t)))return!1;var r;return kt(n,function(n,t){r=t}),r===x||zi.call(n,r)}function ne(n){for(var t=Lu(n),r=t.length,e=r&&n.length,u=G.support,i=e&&Yr(e)&&(Aa(n)||u.nonEnumArgs&&vu(n)),o=-1,a=[];++o<r;){var f=t[o];(i&&Mr(f,e)||zi.call(n,f))&&a.push(f)}return a}function te(n){return null==n?[]:Yr(Bo(n))?bu(n)?n:Si(n):qu(n)}function re(n){return bu(n)?n:Si(n)}function ee(n){if(Aa(n))return n;var t=[];return u(n).replace(jn,function(n,r,e,u){t.push(e?u.replace(Rn,"$1"):r||n)}),t}function ue(n){return n instanceof Mn?n.clone():new nn(n.__wrapped__,n.__chain__,et(n.__actions__))}function ie(n,t,r){t=(r?qr(n,t,r):null==t)?1:po(+t||1,1);for(var e=0,u=n?n.length:0,i=-1,o=Oi(Yi(u/t));u>e;)o[++i]=Yt(n,e,e+=t);return o}function oe(n){for(var t=-1,r=n?n.length:0,e=-1,u=[];++t<r;){var i=n[t];i&&(u[++e]=i)}return u}function ae(n,t,r){var e=n?n.length:0;return e?((r?qr(n,t,r):null==t)&&(t=1),Yt(n,0>t?0:t)):[]}function fe(n,t,r){var e=n?n.length:0;return e?((r?qr(n,t,r):null==t)&&(t=1),t=e-(+t||0),Yt(n,0,0>t?0:t)):[]}function ce(n,t,r){return n&&n.length?nr(n,Fr(t,r,3),!0,!0):[]}function le(n,t,r){return n&&n.length?nr(n,Fr(t,r,3),!0):[]}function se(n,t,r,e){var u=n?n.length:0;return u?(r&&"number"!=typeof r&&qr(n,t,r)&&(r=0,e=u),Ot(n,t,r,e)):[]}function pe(n){return n?n[0]:x}function he(n,t,r){var e=n?n.length:0;return r&&qr(n,t,r)&&(t=!1),e?Rt(n,t):[]}function ve(n){var t=n?n.length:0;return t?Rt(n,!0):[]}function _e(n,t,e){var u=n?n.length:0;if(!u)return-1;if("number"==typeof e)e=0>e?po(u+e,0):e;else if(e){var i=rr(n,t),o=n[i];return(t===t?t===o:o!==o)?i:-1}return r(n,t,e||0)}function ge(n){return fe(n,1)}function ye(){for(var n=[],t=-1,e=arguments.length,u=[],i=$r(),o=i==r,a=[];++t<e;){var f=arguments[t];(Aa(f)||vu(f))&&(n.push(f),u.push(o&&f.length>=120?Fo(t&&f):null))}if(e=n.length,2>e)return a;var c=n[0],l=-1,s=c?c.length:0,p=u[0];n:for(;++l<s;)if(f=c[l],(p?Qn(p,f):i(a,f,0))<0){for(t=e;--t;){var h=u[t];if((h?Qn(h,f):i(n[t],f,0))<0)continue n}p&&p.push(f),a.push(f)}return a}function de(n){var t=n?n.length:0;return t?n[t-1]:x}function me(n,t,r){var e=n?n.length:0;if(!e)return-1;var u=e;if("number"==typeof r)u=(0>r?po(e+r,0):ho(r||0,e-1))+1;else if(r){u=rr(n,t,!0)-1;var i=n[u];return(t===t?t===i:i!==i)?u:-1}if(t!==t)return h(n,u,!0);for(;u--;)if(n[u]===t)return u;return-1}function we(){var n=arguments,t=n[0];if(!t||!t.length)return t;for(var r=0,e=$r(),u=n.length;++r<u;)for(var i=0,o=n[r];(i=e(t,o,i))>-1;)eo.call(t,i,1);return t}function be(n,t,r){var e=[];if(!n||!n.length)return e;var u=-1,i=[],o=n.length;for(t=Fr(t,r,3);++u<o;){var a=n[u];t(a,u,n)&&(e.push(a),i.push(u))}return qt(n,i),e}function xe(n){return ae(n,1)}function Ae(n,t,r){var e=n?n.length:0;return e?(r&&"number"!=typeof r&&qr(n,t,r)&&(t=0,r=e),Yt(n,t,r)):[]}function je(n,t,r){var e=n?n.length:0;return e?((r?qr(n,t,r):null==t)&&(t=1),Yt(n,0,0>t?0:t)):[]}function Oe(n,t,r){var e=n?n.length:0;return e?((r?qr(n,t,r):null==t)&&(t=1),t=e-(+t||0),Yt(n,0>t?0:t)):[]}function Ee(n,t,r){return n&&n.length?nr(n,Fr(t,r,3),!1,!0):[]}function Ie(n,t,r){return n&&n.length?nr(n,Fr(t,r,3)):[]}function Re(n,t,e,u){var i=n?n.length:0;if(!i)return[];null!=t&&"boolean"!=typeof t&&(u=e,e=qr(n,t,u)?null:t,t=!1);var o=Fr();return(o!==wt||null!=e)&&(e=o(e,u,3)),t&&$r()==r?y(n,e):Ht(n,e)}function ke(n){for(var t=-1,r=(n&&n.length&&ct(ft(n,Bo)))>>>0,e=Oi(r);++t<r;)e[t]=ft(n,Pt(t));return e}function Ce(){for(var n=-1,t=arguments.length;++n<t;){var r=arguments[n];if(Aa(r)||vu(r))var e=e?At(e,r).concat(At(r,e)):r}return e?Ht(e):[]}function Se(n,t){var r=-1,e=n?n.length:0,u={};for(!e||t||Aa(n[0])||(t=[]);++r<e;){var i=n[r];t?u[i]=t[r]:i&&(u[i[0]]=i[1])}return u}function Te(n){var t=G(n);return t.__chain__=!0,t}function Ue(n,t,r){return t.call(r,n),n}function We(n,t,r){return t.call(r,n)}function Ne(){return Te(this)}function Fe(){return new nn(this.value(),this.__chain__)}function $e(n){for(var t,r=this;r instanceof H;){var e=ue(r);t?u.__wrapped__=e:t=e;var u=e;r=r.__wrapped__}return u.__wrapped__=n,t}function Le(){var n=this.__wrapped__;return n instanceof Mn?(this.__actions__.length&&(n=new Mn(this)),new nn(n.reverse(),this.__chain__)):this.thru(function(n){return n.reverse()})}function Be(){return this.value()+""}function ze(){return tr(this.__wrapped__,this.__actions__)}function De(n,t,r){var e=Aa(n)?ot:jt;return r&&qr(n,t,r)&&(t=null),("function"!=typeof t||r!==x)&&(t=Fr(t,r,3)),e(n,t)}function Pe(n,t,r){var e=Aa(n)?at:Et;return t=Fr(t,r,3),e(n,t)}function Me(n,t){return Qo(n,Lt(t))}function qe(n,t,r,e){var u=n?Bo(n):0;return Yr(u)||(n=qu(n),u=n.length),u?(r="number"!=typeof r||e&&qr(t,r,e)?0:0>r?po(u+r,0):r||0,"string"==typeof n||!Aa(n)&&Ru(n)?u>r&&n.indexOf(t,r)>-1:$r(n,t,r)>-1):!1}function Ke(n,t,r){var e=Aa(n)?ft:$t;return t=Fr(t,r,3),e(n,t)}function Ve(n,t){return Ke(n,di(t))}function Ye(n,t,r){var e=Aa(n)?at:Et;return t=Fr(t,r,3),e(n,function(n,r,e){return!t(n,r,e)})}function Ge(n,t,r){if(r?qr(n,t,r):null==t){n=te(n);var e=n.length;return e>0?n[Kt(0,e-1)]:x}var u=Je(n);return u.length=ho(0>t?0:+t||0,u.length),u}function Je(n){n=te(n);for(var t=-1,r=n.length,e=Oi(r);++t<r;){var u=Kt(0,t);t!=u&&(e[t]=e[u]),e[u]=n[t]}return e}function Xe(n){var t=n?Bo(n):0;return Yr(t)?t:Na(n).length}function Ze(n,t,r){var e=Aa(n)?ht:Gt;return r&&qr(n,t,r)&&(t=null),("function"!=typeof t||r!==x)&&(t=Fr(t,r,3)),e(n,t)}function He(n,t,r){if(null==n)return[];r&&qr(n,t,r)&&(t=null);var e=-1;t=Fr(t,r,3);var u=$t(n,function(n,r,u){return{criteria:t(n,r,u),index:++e,value:n}});return Jt(u,f)}function Qe(n,t,r,e){return null==n?[]:(e&&qr(t,r,e)&&(r=null),Aa(t)||(t=null==t?[]:[t]),Aa(r)||(r=null==r?[]:[r]),Xt(n,t,r))}function nu(n,t){return Pe(n,Lt(t))}function tu(n,t){if("function"!=typeof t){if("function"!=typeof n)throw new Wi(z);var r=n;n=t,t=r}return n=lo(n=+n)?n:0,function(){return--n<1?t.apply(this,arguments):void 0}}function ru(n,t,r){return r&&qr(n,t,r)&&(t=null),t=n&&null==t?n.length:po(+t||0,0),Sr(n,S,null,null,null,null,t)}function eu(n,t){var r;if("function"!=typeof t){if("function"!=typeof n)throw new Wi(z);var e=n;n=t,t=e}return function(){return--n>0&&(r=t.apply(this,arguments)),1>=n&&(t=null),r}}function uu(n,t,r){function e(){p&&Gi(p),f&&Gi(f),f=p=h=x}function u(){var r=t-(la()-l);if(0>=r||r>t){f&&Gi(f);var e=h;f=p=h=x,e&&(v=la(),c=n.apply(s,a),p||f||(a=s=null))}else p=ro(u,r)}function i(){p&&Gi(p),f=p=h=x,(g||_!==t)&&(v=la(),c=n.apply(s,a),p||f||(a=s=null))}function o(){if(a=arguments,l=la(),s=this,h=g&&(p||!y),_===!1)var r=y&&!p;else{f||y||(v=l);var e=_-(l-v),o=0>=e||e>_;o?(f&&(f=Gi(f)),v=l,c=n.apply(s,a)):f||(f=ro(i,e))}return o&&p?p=Gi(p):p||t===_||(p=ro(u,t)),r&&(o=!0,c=n.apply(s,a)),!o||p||f||(a=s=null),c}var a,f,c,l,s,p,h,v=0,_=!1,g=!0;if("function"!=typeof n)throw new Wi(z);if(t=0>t?0:+t||0,r===!0){var y=!0;g=!1}else bu(r)&&(y=r.leading,_="maxWait"in r&&po(+r.maxWait||0,t),g="trailing"in r?r.trailing:g);return o.cancel=e,o}function iu(n,t){if("function"!=typeof n||t&&"function"!=typeof t)throw new Wi(z);var r=function(){var e=arguments,u=r.cache,i=t?t.apply(this,e):e[0];if(u.has(i))return u.get(i);var o=n.apply(this,e);return u.set(i,o),o};return r.cache=new iu.Cache,r}function ou(n){if("function"!=typeof n)throw new Wi(z);return function(){return!n.apply(this,arguments)}}function au(n){return eu(2,n)}function fu(n,t){if("function"!=typeof n)throw new Wi(z);return t=po(t===x?n.length-1:+t||0,0),function(){for(var r=arguments,e=-1,u=po(r.length-t,0),i=Oi(u);++e<u;)i[e]=r[t+e];switch(t){case 0:return n.call(this,i);case 1:return n.call(this,r[0],i);case 2:return n.call(this,r[0],r[1],i)}var o=Oi(t+1);for(e=-1;++e<t;)o[e]=r[e];return o[t]=i,n.apply(this,o)}}function cu(n){if("function"!=typeof n)throw new Wi(z);return function(t){return n.apply(this,t)}}function lu(n,t,r){var e=!0,u=!0;if("function"!=typeof n)throw new Wi(z);return r===!1?e=!1:bu(r)&&(e="leading"in r?!!r.leading:e,u="trailing"in r?!!r.trailing:u),Pn.leading=e,Pn.maxWait=+t,Pn.trailing=u,uu(n,t,Pn)}function su(n,t){return t=null==t?pi:t,Sr(t,k,null,[n],[])}function pu(n,t,r,e){return t&&"boolean"!=typeof t&&qr(n,t,r)?t=!1:"function"==typeof t&&(e=r,r=t,t=!1),r="function"==typeof r&&ur(r,e,1),bt(n,t,r)}function hu(n,t,r){return t="function"==typeof t&&ur(t,r,1),bt(n,!0,t)}function vu(n){var t=v(n)?n.length:x;return Yr(t)&&Pi.call(n)==P}function _u(n){return n===!0||n===!1||v(n)&&Pi.call(n)==q}function gu(n){return v(n)&&Pi.call(n)==K}function yu(n){return!!n&&1===n.nodeType&&v(n)&&Pi.call(n).indexOf("Element")>-1}function du(n){if(null==n)return!0;var t=Bo(n);return Yr(t)&&(Aa(n)||Ru(n)||vu(n)||v(n)&&Oa(n.splice))?!t:!Na(n).length}function mu(n,t,r,e){if(r="function"==typeof r&&ur(r,e,3),!r&&Gr(n)&&Gr(t))return n===t;var u=r?r(n,t):x;return u===x?Wt(n,t,r):!!u}function wu(n){return v(n)&&"string"==typeof n.message&&Pi.call(n)==V}function bu(n){var t=typeof n;return"function"==t||!!n&&"object"==t}function xu(n,t,r,e){var u=Na(t),i=u.length;if(!i)return!0;if(null==n)return!1;if(r="function"==typeof r&&ur(r,e,3),n=re(n),!r&&1==i){var o=u[0],a=t[o];if(Gr(a))return a===n[o]&&(a!==x||o in n)}for(var f=Oi(i),c=Oi(i);i--;)a=f[i]=t[u[i]],c[i]=Gr(a);return Ft(n,u,f,c,r)}function Au(n){return Eu(n)&&n!=+n}function ju(n){return null==n?!1:Pi.call(n)==Y?qi.test(Bi.call(n)):v(n)&&Tn.test(n)}function Ou(n){return null===n}function Eu(n){return"number"==typeof n||v(n)&&Pi.call(n)==J}function Iu(n){return v(n)&&Pi.call(n)==Z||!1}function Ru(n){return"string"==typeof n||v(n)&&Pi.call(n)==Q}function ku(n){return v(n)&&Yr(n.length)&&!!zn[Pi.call(n)]}function Cu(n){return n===x}function Su(n){var t=n?Bo(n):0;return Yr(t)?t?et(n):[]:qu(n)}function Tu(n){return mt(n,Lu(n))}function Uu(n,t,r){var e=Co(n);return r&&qr(n,t,r)&&(t=null),t?ko(e,t):e}function Wu(n){return Tt(n,Lu(n))}function Nu(n,t,r){var e=null==n?x:Ut(n,ee(t),t+"");return e===x?r:e}function Fu(n,t){if(null==n)return!1;var r=zi.call(n,t);return r||Kr(t)||(t=ee(t),n=1==t.length?n:Ut(n,Yt(t,0,-1)),t=de(t),r=null!=n&&zi.call(n,t)),r}function $u(n,t,r){r&&qr(n,t,r)&&(t=null);for(var e=-1,u=Na(n),i=u.length,o={};++e<i;){var a=u[e],f=n[a];t?zi.call(o,f)?o[f].push(a):o[f]=[a]:o[f]=a}return o}function Lu(n){if(null==n)return[];bu(n)||(n=Si(n));var t=n.length;t=t&&Yr(t)&&(Aa(n)||Ro.nonEnumArgs&&vu(n))&&t||0;for(var r=n.constructor,e=-1,u="function"==typeof r&&r.prototype===n,i=Oi(t),o=t>0;++e<t;)i[e]=e+"";for(var a in n)o&&Mr(a,t)||"constructor"==a&&(u||!zi.call(n,a))||i.push(a);return i}function Bu(n,t,r){var e={};return t=Fr(t,r,3),Ct(n,function(n,r,u){e[r]=t(n,r,u)}),e}function zu(n){for(var t=-1,r=Na(n),e=r.length,u=Oi(e);++t<e;){var i=r[t];u[t]=[i,n[i]]}return u}function Du(n,t,r){var e=null==n?x:n[t];return e===x&&(null==n||Kr(t,n)||(t=ee(t),n=1==t.length?n:Ut(n,Yt(t,0,-1)),e=null==n?x:n[de(t)]),e=e===x?r:e),Oa(e)?e.call(n):e}function Pu(n,t,r){if(null==n)return n;var e=t+"";t=null!=n[e]||Kr(t,n)?[e]:ee(t);for(var u=-1,i=t.length,o=i-1,a=n;null!=a&&++u<i;){var f=t[u];bu(a)&&(u==o?a[f]=r:null==a[f]&&(a[f]=Mr(t[u+1])?[]:{})),a=a[f]}return n}function Mu(n,t,r,e){var u=Aa(n)||ku(n);if(t=Fr(t,e,4),null==r)if(u||bu(n)){var i=n.constructor;r=u?Aa(n)?new i:[]:Co(Oa(i)&&i.prototype)}else r={};return(u?ut:Ct)(n,function(n,e,u){return t(r,n,e,u)}),r}function qu(n){return Qt(n,Na(n))}function Ku(n){return Qt(n,Lu(n))}function Vu(n,t,r){return t=+t||0,"undefined"==typeof r?(r=t,t=0):r=+r||0,n>=ho(t,r)&&n<po(t,r)}function Yu(n,t,r){r&&qr(n,t,r)&&(t=r=null);var e=null==n,u=null==t;if(null==r&&(u&&"boolean"==typeof n?(r=n,n=1):"boolean"==typeof t&&(r=t,u=!0)),e&&u&&(t=1,u=!1),n=+n||0,u?(t=n,n=0):t=+t||0,r||n%1||t%1){var i=yo();return ho(n+i*(t-n+parseFloat("1e-"+((i+"").length-1))),t)}return Kt(n,t)}function Gu(n){return n=u(n),n&&n.charAt(0).toUpperCase()+n.slice(1)}function Ju(n){return n=u(n),n&&n.replace(Un,l).replace(In,"")}function Xu(n,t,r){n=u(n),t+="";var e=n.length;return r=r===x?e:ho(0>r?0:+r||0,e),r-=t.length,r>=0&&n.indexOf(t,r)==r}function Zu(n){return n=u(n),n&&dn.test(n)?n.replace(gn,s):n}function Hu(n){return n=u(n),n&&En.test(n)?n.replace(On,"\\$&"):n}function Qu(n,t,r){n=u(n),t=+t;var e=n.length;if(e>=t||!lo(t))return n;var i=(t-e)/2,o=Ji(i),a=Yi(i);return r=Rr("",a,r),r.slice(0,o)+n+r}function ni(n,t,r){return r&&qr(n,t,r)&&(t=0),go(n,t)}function ti(n,t){var r="";if(n=u(n),t=+t,1>t||!n||!lo(t))return r;do t%2&&(r+=n),t=Ji(t/2),n+=n;while(t);return r}function ri(n,t,r){return n=u(n),r=null==r?0:ho(0>r?0:+r||0,n.length),
n.lastIndexOf(t,r)==r}function ei(n,t,r){var e=G.templateSettings;r&&qr(n,t,r)&&(t=r=null),n=u(n),t=yt(ko({},r||t),e,gt);var i,o,a=yt(ko({},t.imports),e.imports,gt),f=Na(a),c=Qt(a,f),l=0,s=t.interpolate||Wn,h="__p += '",v=Ti((t.escape||Wn).source+"|"+s.source+"|"+(s===bn?kn:Wn).source+"|"+(t.evaluate||Wn).source+"|$","g"),_="//# sourceURL="+("sourceURL"in t?t.sourceURL:"lodash.templateSources["+ ++Bn+"]")+"\n";n.replace(v,function(t,r,e,u,a,f){return e||(e=u),h+=n.slice(l,f).replace(Nn,p),r&&(i=!0,h+="' +\n__e("+r+") +\n'"),a&&(o=!0,h+="';\n"+a+";\n__p += '"),e&&(h+="' +\n((__t = ("+e+")) == null ? '' : __t) +\n'"),l=f+t.length,t}),h+="';\n";var g=t.variable;g||(h="with (obj) {\n"+h+"\n}\n"),h=(o?h.replace(pn,""):h).replace(hn,"$1").replace(vn,"$1;"),h="function("+(g||"obj")+") {\n"+(g?"":"obj || (obj = {});\n")+"var __t, __p = ''"+(i?", __e = _.escape":"")+(o?", __j = Array.prototype.join;\nfunction print() { __p += __j.call(arguments, '') }\n":";\n")+h+"return __p\n}";var y=Ka(function(){return Ri(f,_+"return "+h).apply(x,c)});if(y.source=h,wu(y))throw y;return y}function ui(n,t,r){var e=n;return(n=u(n))?(r?qr(e,t,r):null==t)?n.slice(d(n),m(n)+1):(t+="",n.slice(o(n,t),a(n,t)+1)):n}function ii(n,t,r){var e=n;return n=u(n),n?n.slice((r?qr(e,t,r):null==t)?d(n):o(n,t+"")):n}function oi(n,t,r){var e=n;return n=u(n),n?(r?qr(e,t,r):null==t)?n.slice(0,m(n)+1):n.slice(0,a(n,t+"")+1):n}function ai(n,t,r){r&&qr(n,t,r)&&(t=null);var e=U,i=W;if(null!=t)if(bu(t)){var o="separator"in t?t.separator:o;e="length"in t?+t.length||0:e,i="omission"in t?u(t.omission):i}else e=+t||0;if(n=u(n),e>=n.length)return n;var a=e-i.length;if(1>a)return i;var f=n.slice(0,a);if(null==o)return f+i;if(Iu(o)){if(n.slice(a).search(o)){var c,l,s=n.slice(0,a);for(o.global||(o=Ti(o.source,(Cn.exec(o)||"")+"g")),o.lastIndex=0;c=o.exec(s);)l=c.index;f=f.slice(0,null==l?a:l)}}else if(n.indexOf(o,a)!=a){var p=f.lastIndexOf(o);p>-1&&(f=f.slice(0,p))}return f+i}function fi(n){return n=u(n),n&&yn.test(n)?n.replace(_n,w):n}function ci(n,t,r){return r&&qr(n,t,r)&&(t=null),n=u(n),n.match(t||Fn)||[]}function li(n,t,r){return r&&qr(n,t,r)&&(t=null),wt(n,t)}function si(n){return function(){return n}}function pi(n){return n}function hi(n){return Lt(bt(n,!0))}function vi(n,t){return Bt(n,bt(t,!0))}function _i(n,t,r){if(null==r){var e=bu(t),u=e&&Na(t),i=u&&u.length&&Tt(t,u);(i?i.length:e)||(i=!1,r=t,t=n,n=this)}i||(i=Tt(t,Na(t)));var o=!0,a=-1,f=Oa(n),c=i.length;r===!1?o=!1:bu(r)&&"chain"in r&&(o=r.chain);for(;++a<c;){var l=i[a],s=t[l];n[l]=s,f&&(n.prototype[l]=function(t){return function(){var r=this.__chain__;if(o||r){var e=n(this.__wrapped__),u=e.__actions__=et(this.__actions__);return u.push({func:t,args:arguments,thisArg:n}),e.__chain__=r,e}var i=[this.value()];return Hi.apply(i,arguments),t.apply(n,i)}}(s))}return n}function gi(){return _._=Mi,this}function yi(){}function di(n){return Kr(n)?Pt(n):Mt(n)}function mi(n){return function(t){return Ut(n,ee(t),t+"")}}function wi(n,t,r){r&&qr(n,t,r)&&(t=r=null),n=+n||0,r=null==r?1:+r||0,null==t?(t=n,n=0):t=+t||0;for(var e=-1,u=po(Yi((t-n)/(r||1)),0),i=Oi(u);++e<u;)i[e]=n,n+=r;return i}function bi(n,t,r){if(n=Ji(n),1>n||!lo(n))return[];var e=-1,u=Oi(ho(n,bo));for(t=ur(t,r,1);++e<n;)bo>e?u[e]=t(e):t(e);return u}function xi(n){var t=++Di;return u(n)+t}function Ai(n,t){return(+n||0)+(+t||0)}function ji(n,t,r){r&&qr(n,t,r)&&(t=null);var e=Fr(),u=null==t;return e===wt&&u||(u=!1,t=e(t,r,3)),u?vt(Aa(n)?n:te(n)):Zt(n,t)}_=_?tt.defaults(nt.Object(),_,tt.pick(nt,Ln)):nt;var Oi=_.Array,Ei=_.Date,Ii=_.Error,Ri=_.Function,ki=_.Math,Ci=_.Number,Si=_.Object,Ti=_.RegExp,Ui=_.String,Wi=_.TypeError,Ni=Oi.prototype,Fi=Si.prototype,$i=Ui.prototype,Li=(Li=_.window)&&Li.document,Bi=Ri.prototype.toString,zi=Fi.hasOwnProperty,Di=0,Pi=Fi.toString,Mi=_._,qi=Ti("^"+Hu(Pi).replace(/toString|(function).*?(?=\\\()| for .+?(?=\\\])/g,"$1.*?")+"$"),Ki=ju(Ki=_.ArrayBuffer)&&Ki,Vi=ju(Vi=Ki&&new Ki(0).slice)&&Vi,Yi=ki.ceil,Gi=_.clearTimeout,Ji=ki.floor,Xi=ju(Xi=Si.getOwnPropertySymbols)&&Xi,Zi=ju(Zi=Si.getPrototypeOf)&&Zi,Hi=Ni.push,Qi=ju(Si.preventExtensions=Si.preventExtensions)&&Qi,no=Fi.propertyIsEnumerable,to=ju(to=_.Set)&&to,ro=_.setTimeout,eo=Ni.splice,uo=ju(uo=_.Uint8Array)&&uo,io=ju(io=_.WeakMap)&&io,oo=function(){try{var n=ju(n=_.Float64Array)&&n,t=new n(new Ki(10),0,1)&&n}catch(r){}return t}(),ao=function(){var n={1:0},t=Qi&&ju(t=Si.assign)&&t;try{t(Qi(n),"xo")}catch(r){}return!n[1]&&t}(),fo=ju(fo=Oi.isArray)&&fo,co=ju(co=Si.create)&&co,lo=_.isFinite,so=ju(so=Si.keys)&&so,po=ki.max,ho=ki.min,vo=ju(vo=Ei.now)&&vo,_o=ju(_o=Ci.isFinite)&&_o,go=_.parseInt,yo=ki.random,mo=Ci.NEGATIVE_INFINITY,wo=Ci.POSITIVE_INFINITY,bo=ki.pow(2,32)-1,xo=bo-1,Ao=bo>>>1,jo=oo?oo.BYTES_PER_ELEMENT:0,Oo=ki.pow(2,53)-1,Eo=io&&new io,Io={},Ro=G.support={};!function(n){var t=function(){this.x=n},r=[];t.prototype={valueOf:n,y:n};for(var e in new t)r.push(e);Ro.funcDecomp=/\bthis\b/.test(function(){return this}),Ro.funcNames="string"==typeof Ri.name;try{Ro.dom=11===Li.createDocumentFragment().nodeType}catch(u){Ro.dom=!1}try{Ro.nonEnumArgs=!no.call(arguments,1)}catch(u){Ro.nonEnumArgs=!0}}(1,0),G.templateSettings={escape:mn,evaluate:wn,interpolate:bn,variable:"",imports:{_:G}};var ko=ao||function(n,t){return null==t?n:mt(t,zo(t),mt(t,Na(t),n))},Co=function(){function n(){}return function(t){if(bu(t)){n.prototype=t;var r=new n;n.prototype=null}return r||_.Object()}}(),So=lr(Ct),To=lr(St,!0),Uo=sr(),Wo=sr(!0),No=Eo?function(n,t){return Eo.set(n,t),n}:pi;Vi||(ir=Ki&&uo?function(n){var t=n.byteLength,r=oo?Ji(t/jo):0,e=r*jo,u=new Ki(t);if(r){var i=new oo(u,0,r);i.set(new oo(n,0,r))}return t!=e&&(i=new uo(u,e),i.set(new uo(n,e))),u}:si(null));var Fo=co&&to?function(n){return new Hn(n)}:si(null),$o=Eo?function(n){return Eo.get(n)}:yi,Lo=function(){return Ro.funcNames?"constant"==si.name?Pt("name"):function(n){for(var t=n.name,r=Io[t],e=r?r.length:0;e--;){var u=r[e],i=u.func;if(null==i||i==n)return u.name}return t}:si("")}(),Bo=Pt("length"),zo=Xi?function(n){return Xi(re(n))}:si([]),Do=function(){var n=0,t=0;return function(r,e){var u=la(),i=F-(u-t);if(t=u,i>0){if(++n>=N)return r}else n=0;return No(r,e)}}(),Po=fu(function(n,t){return Aa(n)||vu(n)?At(n,Rt(t,!1,!0)):[]}),Mo=dr(),qo=dr(!0),Ko=fu(function(t,r){t||(t=[]),r=Rt(r);var e=dt(t,r);return qt(t,r.sort(n)),e}),Vo=Cr(),Yo=Cr(!0),Go=fu(function(n){return Ht(Rt(n,!1,!0))}),Jo=fu(function(n,t){return Aa(n)||vu(n)?At(n,t):[]}),Xo=fu(ke),Zo=fu(function(n,t){var r=n?Bo(n):0;return Yr(r)&&(n=te(n)),dt(n,Rt(t))}),Ho=fr(function(n,t,r){zi.call(n,r)?++n[r]:n[r]=1}),Qo=yr(So),na=yr(To,!0),ta=br(ut,So),ra=br(it,To),ea=fr(function(n,t,r){zi.call(n,r)?n[r].push(t):n[r]=[t]}),ua=fr(function(n,t,r){n[r]=t}),ia=fu(function(n,t,r){var e=-1,u="function"==typeof t,i=Kr(t),o=Bo(n),a=Yr(o)?Oi(o):[];return So(n,function(n){var o=u?t:i&&null!=n&&n[t];a[++e]=o?o.apply(n,r):Pr(n,t,r)}),a}),oa=fr(function(n,t,r){n[r?0:1].push(t)},function(){return[[],[]]}),aa=Er(st,So),fa=Er(pt,To),ca=fu(function(n,t){if(null==n)return[];var r=t[2];return r&&qr(t[0],t[1],r)&&(t.length=1),Xt(n,Rt(t),[])}),la=vo||function(){return(new Ei).getTime()},sa=fu(function(n,t,r){var e=j;if(r.length){var u=g(r,sa.placeholder);e|=k}return Sr(n,e,t,r,u)}),pa=fu(function(n,t){t=t.length?Rt(t):Wu(n);for(var r=-1,e=t.length;++r<e;){var u=t[r];n[u]=Sr(n[u],j,n)}return n}),ha=fu(function(n,t,r){var e=j|O;if(r.length){var u=g(r,ha.placeholder);e|=k}return Sr(t,e,n,r,u)}),va=_r(I),_a=_r(R),ga=fu(function(n,t){return xt(n,1,t)}),ya=fu(function(n,t,r){return xt(n,t,r)}),da=wr(),ma=wr(!0),wa=Or(k),ba=Or(C),xa=fu(function(n,t){return Sr(n,T,null,null,null,Rt(t))}),Aa=fo||function(n){return v(n)&&Yr(n.length)&&Pi.call(n)==M};Ro.dom||(yu=function(n){return!!n&&1===n.nodeType&&v(n)&&!Ea(n)});var ja=_o||function(n){return"number"==typeof n&&lo(n)},Oa=e(/x/)||uo&&!e(uo)?function(n){return Pi.call(n)==Y}:e,Ea=Zi?function(n){if(!n||Pi.call(n)!=X)return!1;var t=n.valueOf,r=ju(t)&&(r=Zi(t))&&Zi(r);return r?n==r||Zi(n)==r:Qr(n)}:Qr,Ia=cr(function(n,t,r){return r?yt(n,t,r):ko(n,t)}),Ra=fu(function(n){var t=n[0];return null==t?t:(n.push(_t),Ia.apply(x,n))}),ka=mr(Ct),Ca=mr(St),Sa=xr(Uo),Ta=xr(Wo),Ua=Ar(Ct),Wa=Ar(St),Na=so?function(n){if(n)var t=n.constructor,r=n.length;return"function"==typeof t&&t.prototype===n||"function"!=typeof n&&Yr(r)?ne(n):bu(n)?so(n):[]}:ne,Fa=cr(zt),$a=fu(function(n,t){if(null==n)return{};if("function"!=typeof t[0]){var t=ft(Rt(t),Ui);return Xr(n,At(Lu(n),t))}var r=ur(t[0],t[1],3);return Zr(n,function(n,t,e){return!r(n,t,e)})}),La=fu(function(n,t){return null==n?{}:"function"==typeof t[0]?Zr(n,ur(t[0],t[1],3)):Xr(n,Rt(t))}),Ba=hr(function(n,t,r){return t=t.toLowerCase(),n+(r?t.charAt(0).toUpperCase()+t.slice(1):t)}),za=hr(function(n,t,r){return n+(r?"-":"")+t.toLowerCase()}),Da=jr(),Pa=jr(!0);8!=go($n+"08")&&(ni=function(n,t,r){return(r?qr(n,t,r):null==t)?t=0:t&&(t=+t),n=ui(n),go(n,t||(Sn.test(n)?16:10))});var Ma=hr(function(n,t,r){return n+(r?"_":"")+t.toLowerCase()}),qa=hr(function(n,t,r){return n+(r?" ":"")+(t.charAt(0).toUpperCase()+t.slice(1))}),Ka=fu(function(n,t){try{return n.apply(x,t)}catch(r){return wu(r)?r:new Ii(r)}}),Va=fu(function(n,t){return function(r){return Pr(r,n,t)}}),Ya=fu(function(n,t){return function(r){return Pr(n,r,t)}}),Ga=gr(ct),Ja=gr(lt,!0);return G.prototype=H.prototype,nn.prototype=Co(H.prototype),nn.prototype.constructor=nn,Mn.prototype=Co(H.prototype),Mn.prototype.constructor=Mn,Yn.prototype["delete"]=Gn,Yn.prototype.get=Jn,Yn.prototype.has=Xn,Yn.prototype.set=Zn,Hn.prototype.push=rt,iu.Cache=Yn,G.after=tu,G.ary=ru,G.assign=Ia,G.at=Zo,G.before=eu,G.bind=sa,G.bindAll=pa,G.bindKey=ha,G.callback=li,G.chain=Te,G.chunk=ie,G.compact=oe,G.constant=si,G.countBy=Ho,G.create=Uu,G.curry=va,G.curryRight=_a,G.debounce=uu,G.defaults=Ra,G.defer=ga,G.delay=ya,G.difference=Po,G.drop=ae,G.dropRight=fe,G.dropRightWhile=ce,G.dropWhile=le,G.fill=se,G.filter=Pe,G.flatten=he,G.flattenDeep=ve,G.flow=da,G.flowRight=ma,G.forEach=ta,G.forEachRight=ra,G.forIn=Sa,G.forInRight=Ta,G.forOwn=Ua,G.forOwnRight=Wa,G.functions=Wu,G.groupBy=ea,G.indexBy=ua,G.initial=ge,G.intersection=ye,G.invert=$u,G.invoke=ia,G.keys=Na,G.keysIn=Lu,G.map=Ke,G.mapValues=Bu,G.matches=hi,G.matchesProperty=vi,G.memoize=iu,G.merge=Fa,G.method=Va,G.methodOf=Ya,G.mixin=_i,G.negate=ou,G.omit=$a,G.once=au,G.pairs=zu,G.partial=wa,G.partialRight=ba,G.partition=oa,G.pick=La,G.pluck=Ve,G.property=di,G.propertyOf=mi,G.pull=we,G.pullAt=Ko,G.range=wi,G.rearg=xa,G.reject=Ye,G.remove=be,G.rest=xe,G.restParam=fu,G.set=Pu,G.shuffle=Je,G.slice=Ae,G.sortBy=He,G.sortByAll=ca,G.sortByOrder=Qe,G.spread=cu,G.take=je,G.takeRight=Oe,G.takeRightWhile=Ee,G.takeWhile=Ie,G.tap=Ue,G.throttle=lu,G.thru=We,G.times=bi,G.toArray=Su,G.toPlainObject=Tu,G.transform=Mu,G.union=Go,G.uniq=Re,G.unzip=ke,G.values=qu,G.valuesIn=Ku,G.where=nu,G.without=Jo,G.wrap=su,G.xor=Ce,G.zip=Xo,G.zipObject=Se,G.backflow=ma,G.collect=Ke,G.compose=ma,G.each=ta,G.eachRight=ra,G.extend=Ia,G.iteratee=li,G.methods=Wu,G.object=Se,G.select=Pe,G.tail=xe,G.unique=Re,_i(G,G),G.add=Ai,G.attempt=Ka,G.camelCase=Ba,G.capitalize=Gu,G.clone=pu,G.cloneDeep=hu,G.deburr=Ju,G.endsWith=Xu,G.escape=Zu,G.escapeRegExp=Hu,G.every=De,G.find=Qo,G.findIndex=Mo,G.findKey=ka,G.findLast=na,G.findLastIndex=qo,G.findLastKey=Ca,G.findWhere=Me,G.first=pe,G.get=Nu,G.has=Fu,G.identity=pi,G.includes=qe,G.indexOf=_e,G.inRange=Vu,G.isArguments=vu,G.isArray=Aa,G.isBoolean=_u,G.isDate=gu,G.isElement=yu,G.isEmpty=du,G.isEqual=mu,G.isError=wu,G.isFinite=ja,G.isFunction=Oa,G.isMatch=xu,G.isNaN=Au,G.isNative=ju,G.isNull=Ou,G.isNumber=Eu,G.isObject=bu,G.isPlainObject=Ea,G.isRegExp=Iu,G.isString=Ru,G.isTypedArray=ku,G.isUndefined=Cu,G.kebabCase=za,G.last=de,G.lastIndexOf=me,G.max=Ga,G.min=Ja,G.noConflict=gi,G.noop=yi,G.now=la,G.pad=Qu,G.padLeft=Da,G.padRight=Pa,G.parseInt=ni,G.random=Yu,G.reduce=aa,G.reduceRight=fa,G.repeat=ti,G.result=Du,G.runInContext=b,G.size=Xe,G.snakeCase=Ma,G.some=Ze,G.sortedIndex=Vo,G.sortedLastIndex=Yo,G.startCase=qa,G.startsWith=ri,G.sum=ji,G.template=ei,G.trim=ui,G.trimLeft=ii,G.trimRight=oi,G.trunc=ai,G.unescape=fi,G.uniqueId=xi,G.words=ci,G.all=De,G.any=Ze,G.contains=qe,G.detect=Qo,G.foldl=aa,G.foldr=fa,G.head=pe,G.include=qe,G.inject=aa,_i(G,function(){var n={};return Ct(G,function(t,r){G.prototype[r]||(n[r]=t)}),n}(),!1),G.sample=Ge,G.prototype.sample=function(n){return this.__chain__||null!=n?this.thru(function(t){return Ge(t,n)}):Ge(this.value())},G.VERSION=A,ut(["bind","bindKey","curry","curryRight","partial","partialRight"],function(n){G[n].placeholder=G}),ut(["dropWhile","filter","map","takeWhile"],function(n,t){var r=t!=B,e=t==$;Mn.prototype[n]=function(n,u){var i=this.__filtered__,o=i&&e?new Mn(this):this.clone(),a=o.__iteratees__||(o.__iteratees__=[]);return a.push({done:!1,count:0,index:0,iteratee:Fr(n,u,1),limit:-1,type:t}),o.__filtered__=i||r,o}}),ut(["drop","take"],function(n,t){var r=n+"While";Mn.prototype[n]=function(r){var e=this.__filtered__,u=e&&!t?this.dropWhile():this.clone();if(r=null==r?1:po(Ji(r)||0,0),e)t?u.__takeCount__=ho(u.__takeCount__,r):de(u.__iteratees__).limit=r;else{var i=u.__views__||(u.__views__=[]);i.push({size:r,type:n+(u.__dir__<0?"Right":"")})}return u},Mn.prototype[n+"Right"]=function(t){return this.reverse()[n](t).reverse()},Mn.prototype[n+"RightWhile"]=function(n,t){return this.reverse()[r](n,t).reverse()}}),ut(["first","last"],function(n,t){var r="take"+(t?"Right":"");Mn.prototype[n]=function(){return this[r](1).value()[0]}}),ut(["initial","rest"],function(n,t){var r="drop"+(t?"":"Right");Mn.prototype[n]=function(){return this[r](1)}}),ut(["pluck","where"],function(n,t){var r=t?"filter":"map",e=t?Lt:di;Mn.prototype[n]=function(n){return this[r](e(n))}}),Mn.prototype.compact=function(){return this.filter(pi)},Mn.prototype.reject=function(n,t){return n=Fr(n,t,1),this.filter(function(t){return!n(t)})},Mn.prototype.slice=function(n,t){n=null==n?0:+n||0;var r=0>n?this.takeRight(-n):this.drop(n);return t!==x&&(t=+t||0,r=0>t?r.dropRight(-t):r.take(t-n)),r},Mn.prototype.toArray=function(){return this.drop(0)},Ct(Mn.prototype,function(n,t){var r=G[t];if(r){var e=/^(?:filter|map|reject)|While$/.test(t),u=/^(?:first|last)$/.test(t);G.prototype[t]=function(){var t=arguments,i=(t.length,this.__chain__),o=this.__wrapped__,a=!!this.__actions__.length,f=o instanceof Mn,c=t[0],l=f||Aa(o);l&&e&&"function"==typeof c&&1!=c.length&&(f=l=!1);var s=f&&!a;if(u&&!i)return s?n.call(o):r.call(G,this.value());var p=function(n){var e=[n];return Hi.apply(e,t),r.apply(G,e)};if(l){var h=s?o:new Mn(this),v=n.apply(h,t);if(!u&&(a||v.__actions__)){var _=v.__actions__||(v.__actions__=[]);_.push({func:We,args:[p],thisArg:G})}return new nn(v,i)}return this.thru(p)}}}),ut(["concat","join","pop","push","replace","shift","sort","splice","split","unshift"],function(n){var t=(/^(?:replace|split)$/.test(n)?$i:Ni)[n],r=/^(?:push|sort|unshift)$/.test(n)?"tap":"thru",e=/^(?:join|pop|replace|shift)$/.test(n);G.prototype[n]=function(){var n=arguments;return e&&!this.__chain__?t.apply(this.value(),n):this[r](function(r){return t.apply(r,n)})}}),Ct(Mn.prototype,function(n,t){var r=G[t];if(r){var e=r.name,u=Io[e]||(Io[e]=[]);u.push({name:t,func:r})}}),Io[Ir(null,O).name]=[{name:"wrapper",func:null}],Mn.prototype.clone=qn,Mn.prototype.reverse=Kn,Mn.prototype.value=Vn,G.prototype.chain=Ne,G.prototype.commit=Fe,G.prototype.plant=$e,G.prototype.reverse=Le,G.prototype.toString=Be,G.prototype.run=G.prototype.toJSON=G.prototype.valueOf=G.prototype.value=ze,G.prototype.collect=G.prototype.map,G.prototype.head=G.prototype.first,G.prototype.select=G.prototype.filter,G.prototype.tail=G.prototype.rest,G}var x,A="3.7.0",j=1,O=2,E=4,I=8,R=16,k=32,C=64,S=128,T=256,U=30,W="...",N=150,F=16,$=0,L=1,B=2,z="Expected a function",D="__lodash_placeholder__",P="[object Arguments]",M="[object Array]",q="[object Boolean]",K="[object Date]",V="[object Error]",Y="[object Function]",G="[object Map]",J="[object Number]",X="[object Object]",Z="[object RegExp]",H="[object Set]",Q="[object String]",nn="[object WeakMap]",tn="[object ArrayBuffer]",rn="[object Float32Array]",en="[object Float64Array]",un="[object Int8Array]",on="[object Int16Array]",an="[object Int32Array]",fn="[object Uint8Array]",cn="[object Uint8ClampedArray]",ln="[object Uint16Array]",sn="[object Uint32Array]",pn=/\b__p \+= '';/g,hn=/\b(__p \+=) '' \+/g,vn=/(__e\(.*?\)|\b__t\)) \+\n'';/g,_n=/&(?:amp|lt|gt|quot|#39|#96);/g,gn=/[&<>"'`]/g,yn=RegExp(_n.source),dn=RegExp(gn.source),mn=/<%-([\s\S]+?)%>/g,wn=/<%([\s\S]+?)%>/g,bn=/<%=([\s\S]+?)%>/g,xn=/\.|\[(?:[^[\]]+|(["'])(?:(?!\1)[^\n\\]|\\.)*?)\1\]/,An=/^\w*$/,jn=/[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\n\\]|\\.)*?)\2)\]/g,On=/[.*+?^${}()|[\]\/\\]/g,En=RegExp(On.source),In=/[\u0300-\u036f\ufe20-\ufe23]/g,Rn=/\\(\\)?/g,kn=/\$\{([^\\}]*(?:\\.[^\\}]*)*)\}/g,Cn=/\w*$/,Sn=/^0[xX]/,Tn=/^\[object .+?Constructor\]$/,Un=/[\xc0-\xd6\xd8-\xde\xdf-\xf6\xf8-\xff]/g,Wn=/($^)/,Nn=/['\n\r\u2028\u2029\\]/g,Fn=function(){var n="[A-Z\\xc0-\\xd6\\xd8-\\xde]",t="[a-z\\xdf-\\xf6\\xf8-\\xff]+";return RegExp(n+"+(?="+n+t+")|"+n+"?"+t+"|"+n+"+|[0-9]+","g")}(),$n=" 	\f \ufeff\n\r\u2028\u2029 ᠎             　",Ln=["Array","ArrayBuffer","Date","Error","Float32Array","Float64Array","Function","Int8Array","Int16Array","Int32Array","Math","Number","Object","RegExp","Set","String","_","clearTimeout","document","isFinite","parseInt","setTimeout","TypeError","Uint8Array","Uint8ClampedArray","Uint16Array","Uint32Array","WeakMap","window"],Bn=-1,zn={};zn[rn]=zn[en]=zn[un]=zn[on]=zn[an]=zn[fn]=zn[cn]=zn[ln]=zn[sn]=!0,zn[P]=zn[M]=zn[tn]=zn[q]=zn[K]=zn[V]=zn[Y]=zn[G]=zn[J]=zn[X]=zn[Z]=zn[H]=zn[Q]=zn[nn]=!1;var Dn={};Dn[P]=Dn[M]=Dn[tn]=Dn[q]=Dn[K]=Dn[rn]=Dn[en]=Dn[un]=Dn[on]=Dn[an]=Dn[J]=Dn[X]=Dn[Z]=Dn[Q]=Dn[fn]=Dn[cn]=Dn[ln]=Dn[sn]=!0,Dn[V]=Dn[Y]=Dn[G]=Dn[H]=Dn[nn]=!1;var Pn={leading:!1,maxWait:0,trailing:!1},Mn={"À":"A","Á":"A","Â":"A","Ã":"A","Ä":"A","Å":"A","à":"a","á":"a","â":"a","ã":"a","ä":"a","å":"a","Ç":"C","ç":"c","Ð":"D","ð":"d","È":"E","É":"E","Ê":"E","Ë":"E","è":"e","é":"e","ê":"e","ë":"e","Ì":"I","Í":"I","Î":"I","Ï":"I","ì":"i","í":"i","î":"i","ï":"i","Ñ":"N","ñ":"n","Ò":"O","Ó":"O","Ô":"O","Õ":"O","Ö":"O","Ø":"O","ò":"o","ó":"o","ô":"o","õ":"o","ö":"o","ø":"o","Ù":"U","Ú":"U","Û":"U","Ü":"U","ù":"u","ú":"u","û":"u","ü":"u","Ý":"Y","ý":"y","ÿ":"y","Æ":"Ae","æ":"ae","Þ":"Th","þ":"th","ß":"ss"},qn={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;","`":"&#96;"},Kn={"&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&#39;":"'","&#96;":"`"},Vn={"function":!0,object:!0},Yn={"\\":"\\","'":"'","\n":"n","\r":"r","\u2028":"u2028","\u2029":"u2029"},Gn=Vn[typeof exports]&&exports&&!exports.nodeType&&exports,Jn=Vn[typeof module]&&module&&!module.nodeType&&module,Xn=Gn&&Jn&&"object"==typeof global&&global&&global.Object&&global,Zn=Vn[typeof self]&&self&&self.Object&&self,Hn=Vn[typeof window]&&window&&window.Object&&window,Qn=Jn&&Jn.exports===Gn&&Gn,nt=Xn||Hn!==(this&&this.window)&&Hn||Zn||this,tt=b();"function"==typeof define&&"object"==typeof define.amd&&define.amd?(nt._=tt,define(function(){return tt})):Gn&&Jn?Qn?(Jn.exports=tt)._=tt:Gn._=tt:nt._=tt}).call(this);


}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],85:[function(require,module,exports){
!function(t){if("object"==typeof exports)module.exports=t();else if("function"==typeof define&&define.amd)define(t);else{var r;try{r=window}catch(e){r=self}r.SparkMD5=t()}}(function(t){"use strict";var r=function(t,r){return t+r&4294967295},e=function(t,e,n,i,f,o){return e=r(r(e,t),r(i,o)),r(e<<f|e>>>32-f,n)},n=function(t,r,n,i,f,o,s){return e(r&n|~r&i,t,r,f,o,s)},i=function(t,r,n,i,f,o,s){return e(r&i|n&~i,t,r,f,o,s)},f=function(t,r,n,i,f,o,s){return e(r^n^i,t,r,f,o,s)},o=function(t,r,n,i,f,o,s){return e(n^(r|~i),t,r,f,o,s)},s=function(t,e){var s=t[0],u=t[1],a=t[2],h=t[3];s=n(s,u,a,h,e[0],7,-680876936),h=n(h,s,u,a,e[1],12,-389564586),a=n(a,h,s,u,e[2],17,606105819),u=n(u,a,h,s,e[3],22,-1044525330),s=n(s,u,a,h,e[4],7,-176418897),h=n(h,s,u,a,e[5],12,1200080426),a=n(a,h,s,u,e[6],17,-1473231341),u=n(u,a,h,s,e[7],22,-45705983),s=n(s,u,a,h,e[8],7,1770035416),h=n(h,s,u,a,e[9],12,-1958414417),a=n(a,h,s,u,e[10],17,-42063),u=n(u,a,h,s,e[11],22,-1990404162),s=n(s,u,a,h,e[12],7,1804603682),h=n(h,s,u,a,e[13],12,-40341101),a=n(a,h,s,u,e[14],17,-1502002290),u=n(u,a,h,s,e[15],22,1236535329),s=i(s,u,a,h,e[1],5,-165796510),h=i(h,s,u,a,e[6],9,-1069501632),a=i(a,h,s,u,e[11],14,643717713),u=i(u,a,h,s,e[0],20,-373897302),s=i(s,u,a,h,e[5],5,-701558691),h=i(h,s,u,a,e[10],9,38016083),a=i(a,h,s,u,e[15],14,-660478335),u=i(u,a,h,s,e[4],20,-405537848),s=i(s,u,a,h,e[9],5,568446438),h=i(h,s,u,a,e[14],9,-1019803690),a=i(a,h,s,u,e[3],14,-187363961),u=i(u,a,h,s,e[8],20,1163531501),s=i(s,u,a,h,e[13],5,-1444681467),h=i(h,s,u,a,e[2],9,-51403784),a=i(a,h,s,u,e[7],14,1735328473),u=i(u,a,h,s,e[12],20,-1926607734),s=f(s,u,a,h,e[5],4,-378558),h=f(h,s,u,a,e[8],11,-2022574463),a=f(a,h,s,u,e[11],16,1839030562),u=f(u,a,h,s,e[14],23,-35309556),s=f(s,u,a,h,e[1],4,-1530992060),h=f(h,s,u,a,e[4],11,1272893353),a=f(a,h,s,u,e[7],16,-155497632),u=f(u,a,h,s,e[10],23,-1094730640),s=f(s,u,a,h,e[13],4,681279174),h=f(h,s,u,a,e[0],11,-358537222),a=f(a,h,s,u,e[3],16,-722521979),u=f(u,a,h,s,e[6],23,76029189),s=f(s,u,a,h,e[9],4,-640364487),h=f(h,s,u,a,e[12],11,-421815835),a=f(a,h,s,u,e[15],16,530742520),u=f(u,a,h,s,e[2],23,-995338651),s=o(s,u,a,h,e[0],6,-198630844),h=o(h,s,u,a,e[7],10,1126891415),a=o(a,h,s,u,e[14],15,-1416354905),u=o(u,a,h,s,e[5],21,-57434055),s=o(s,u,a,h,e[12],6,1700485571),h=o(h,s,u,a,e[3],10,-1894986606),a=o(a,h,s,u,e[10],15,-1051523),u=o(u,a,h,s,e[1],21,-2054922799),s=o(s,u,a,h,e[8],6,1873313359),h=o(h,s,u,a,e[15],10,-30611744),a=o(a,h,s,u,e[6],15,-1560198380),u=o(u,a,h,s,e[13],21,1309151649),s=o(s,u,a,h,e[4],6,-145523070),h=o(h,s,u,a,e[11],10,-1120210379),a=o(a,h,s,u,e[2],15,718787259),u=o(u,a,h,s,e[9],21,-343485551),t[0]=r(s,t[0]),t[1]=r(u,t[1]),t[2]=r(a,t[2]),t[3]=r(h,t[3])},u=function(t){var r,e=[];for(r=0;64>r;r+=4)e[r>>2]=t.charCodeAt(r)+(t.charCodeAt(r+1)<<8)+(t.charCodeAt(r+2)<<16)+(t.charCodeAt(r+3)<<24);return e},a=function(t){var r,e=[];for(r=0;64>r;r+=4)e[r>>2]=t[r]+(t[r+1]<<8)+(t[r+2]<<16)+(t[r+3]<<24);return e},h=function(t){var r,e,n,i,f,o,a=t.length,h=[1732584193,-271733879,-1732584194,271733878];for(r=64;a>=r;r+=64)s(h,u(t.substring(r-64,r)));for(t=t.substring(r-64),e=t.length,n=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],r=0;e>r;r+=1)n[r>>2]|=t.charCodeAt(r)<<(r%4<<3);if(n[r>>2]|=128<<(r%4<<3),r>55)for(s(h,n),r=0;16>r;r+=1)n[r]=0;return i=8*a,i=i.toString(16).match(/(.*?)(.{0,8})$/),f=parseInt(i[2],16),o=parseInt(i[1],16)||0,n[14]=f,n[15]=o,s(h,n),h},c=function(t){var r,e,n,i,f,o,u=t.length,h=[1732584193,-271733879,-1732584194,271733878];for(r=64;u>=r;r+=64)s(h,a(t.subarray(r-64,r)));for(t=u>r-64?t.subarray(r-64):new Uint8Array(0),e=t.length,n=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],r=0;e>r;r+=1)n[r>>2]|=t[r]<<(r%4<<3);if(n[r>>2]|=128<<(r%4<<3),r>55)for(s(h,n),r=0;16>r;r+=1)n[r]=0;return i=8*u,i=i.toString(16).match(/(.*?)(.{0,8})$/),f=parseInt(i[2],16),o=parseInt(i[1],16)||0,n[14]=f,n[15]=o,s(h,n),h},p=["0","1","2","3","4","5","6","7","8","9","a","b","c","d","e","f"],y=function(t){var r,e="";for(r=0;4>r;r+=1)e+=p[t>>8*r+4&15]+p[t>>8*r&15];return e},_=function(t){var r;for(r=0;r<t.length;r+=1)t[r]=y(t[r]);return t.join("")},d=function(t){return _(h(t))},b=function(){this.reset()};return"5d41402abc4b2a76b9719d911017c592"!==d("hello")&&(r=function(t,r){var e=(65535&t)+(65535&r),n=(t>>16)+(r>>16)+(e>>16);return n<<16|65535&e}),b.prototype.append=function(t){return/[\u0080-\uFFFF]/.test(t)&&(t=unescape(encodeURIComponent(t))),this.appendBinary(t),this},b.prototype.appendBinary=function(t){this._buff+=t,this._length+=t.length;var r,e=this._buff.length;for(r=64;e>=r;r+=64)s(this._state,u(this._buff.substring(r-64,r)));return this._buff=this._buff.substr(r-64),this},b.prototype.end=function(t){var r,e,n=this._buff,i=n.length,f=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];for(r=0;i>r;r+=1)f[r>>2]|=n.charCodeAt(r)<<(r%4<<3);return this._finish(f,i),e=t?this._state:_(this._state),this.reset(),e},b.prototype._finish=function(t,r){var e,n,i,f=r;if(t[f>>2]|=128<<(f%4<<3),f>55)for(s(this._state,t),f=0;16>f;f+=1)t[f]=0;e=8*this._length,e=e.toString(16).match(/(.*?)(.{0,8})$/),n=parseInt(e[2],16),i=parseInt(e[1],16)||0,t[14]=n,t[15]=i,s(this._state,t)},b.prototype.reset=function(){return this._buff="",this._length=0,this._state=[1732584193,-271733879,-1732584194,271733878],this},b.prototype.destroy=function(){delete this._state,delete this._buff,delete this._length},b.hash=function(t,r){/[\u0080-\uFFFF]/.test(t)&&(t=unescape(encodeURIComponent(t)));var e=h(t);return r?e:_(e)},b.hashBinary=function(t,r){var e=h(t);return r?e:_(e)},b.ArrayBuffer=function(){this.reset()},b.ArrayBuffer.prototype.append=function(t){var r,e=this._concatArrayBuffer(this._buff,t),n=e.length;for(this._length+=t.byteLength,r=64;n>=r;r+=64)s(this._state,a(e.subarray(r-64,r)));return this._buff=n>r-64?e.subarray(r-64):new Uint8Array(0),this},b.ArrayBuffer.prototype.end=function(t){var r,e,n=this._buff,i=n.length,f=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];for(r=0;i>r;r+=1)f[r>>2]|=n[r]<<(r%4<<3);return this._finish(f,i),e=t?this._state:_(this._state),this.reset(),e},b.ArrayBuffer.prototype._finish=b.prototype._finish,b.ArrayBuffer.prototype.reset=function(){return this._buff=new Uint8Array(0),this._length=0,this._state=[1732584193,-271733879,-1732584194,271733878],this},b.ArrayBuffer.prototype.destroy=b.prototype.destroy,b.ArrayBuffer.prototype._concatArrayBuffer=function(t,r){var e=t.length,n=new Uint8Array(e+r.byteLength);return n.set(t),n.set(new Uint8Array(r),e),n},b.ArrayBuffer.hash=function(t,r){var e=c(new Uint8Array(t));return r?e:_(e)},b});


},{}],86:[function(require,module,exports){
function noop(){}function isHost(t){var e={}.toString.call(t);switch(e){case"[object File]":case"[object Blob]":case"[object FormData]":return!0;default:return!1}}function getXHR(){if(root.XMLHttpRequest&&("file:"!=root.location.protocol||!root.ActiveXObject))return new XMLHttpRequest;try{return new ActiveXObject("Microsoft.XMLHTTP")}catch(t){}try{return new ActiveXObject("Msxml2.XMLHTTP.6.0")}catch(t){}try{return new ActiveXObject("Msxml2.XMLHTTP.3.0")}catch(t){}try{return new ActiveXObject("Msxml2.XMLHTTP")}catch(t){}return!1}function isObject(t){return t===Object(t)}function serialize(t){if(!isObject(t))return t;var e=[];for(var r in t)null!=t[r]&&e.push(encodeURIComponent(r)+"="+encodeURIComponent(t[r]));return e.join("&")}function parseString(t){for(var e,r,s={},i=t.split("&"),o=0,n=i.length;n>o;++o)r=i[o],e=r.split("="),s[decodeURIComponent(e[0])]=decodeURIComponent(e[1]);return s}function parseHeader(t){var e,r,s,i,o=t.split(/\r?\n/),n={};o.pop();for(var u=0,a=o.length;a>u;++u)r=o[u],e=r.indexOf(":"),s=r.slice(0,e).toLowerCase(),i=trim(r.slice(e+1)),n[s]=i;return n}function type(t){return t.split(/ *; */).shift()}function params(t){return reduce(t.split(/ *; */),function(t,e){var r=e.split(/ *= */),s=r.shift(),i=r.shift();return s&&i&&(t[s]=i),t},{})}function Response(t,e){e=e||{},this.req=t,this.xhr=this.req.xhr,this.text="HEAD"!=this.req.method?this.xhr.responseText:null,this.setStatusProperties(this.xhr.status),this.header=this.headers=parseHeader(this.xhr.getAllResponseHeaders()),this.header["content-type"]=this.xhr.getResponseHeader("content-type"),this.setHeaderProperties(this.header),this.body="HEAD"!=this.req.method?this.parseBody(this.text):null}function Request(t,e){var r=this;Emitter.call(this),this._query=this._query||[],this.method=t,this.url=e,this.header={},this._header={},this.on("end",function(){var t=null,e=null;try{e=new Response(r)}catch(s){t=new Error("Parser is unable to parse the response"),t.parse=!0,t.original=s}r.callback(t,e)})}function request(t,e){return"function"==typeof e?new Request("GET",t).end(e):1==arguments.length?new Request("GET",t):new Request(t,e)}var Emitter=require("emitter"),reduce=require("reduce"),root="undefined"==typeof window?this:window,trim="".trim?function(t){return t.trim()}:function(t){return t.replace(/(^\s*|\s*$)/g,"")};request.serializeObject=serialize,request.parseString=parseString,request.types={html:"text/html",json:"application/json",xml:"application/xml",urlencoded:"application/x-www-form-urlencoded",form:"application/x-www-form-urlencoded","form-data":"application/x-www-form-urlencoded"},request.serialize={"application/x-www-form-urlencoded":serialize,"application/json":JSON.stringify},request.parse={"application/x-www-form-urlencoded":parseString,"application/json":JSON.parse},Response.prototype.get=function(t){return this.header[t.toLowerCase()]},Response.prototype.setHeaderProperties=function(t){var e=this.header["content-type"]||"";this.type=type(e);var r=params(e);for(var s in r)this[s]=r[s]},Response.prototype.parseBody=function(t){var e=request.parse[this.type];return e&&t&&t.length?e(t):null},Response.prototype.setStatusProperties=function(t){var e=t/100|0;this.status=t,this.statusType=e,this.info=1==e,this.ok=2==e,this.clientError=4==e,this.serverError=5==e,this.error=4==e||5==e?this.toError():!1,this.accepted=202==t,this.noContent=204==t||1223==t,this.badRequest=400==t,this.unauthorized=401==t,this.notAcceptable=406==t,this.notFound=404==t,this.forbidden=403==t},Response.prototype.toError=function(){var t=this.req,e=t.method,r=t.url,s="cannot "+e+" "+r+" ("+this.status+")",i=new Error(s);return i.status=this.status,i.method=e,i.url=r,i},request.Response=Response,Emitter(Request.prototype),Request.prototype.use=function(t){return t(this),this},Request.prototype.timeout=function(t){return this._timeout=t,this},Request.prototype.clearTimeout=function(){return this._timeout=0,clearTimeout(this._timer),this},Request.prototype.abort=function(){return this.aborted?void 0:(this.aborted=!0,this.xhr.abort(),this.clearTimeout(),this.emit("abort"),this)},Request.prototype.set=function(t,e){if(isObject(t)){for(var r in t)this.set(r,t[r]);return this}return this._header[t.toLowerCase()]=e,this.header[t]=e,this},Request.prototype.unset=function(t){return delete this._header[t.toLowerCase()],delete this.header[t],this},Request.prototype.getHeader=function(t){return this._header[t.toLowerCase()]},Request.prototype.type=function(t){return this.set("Content-Type",request.types[t]||t),this},Request.prototype.accept=function(t){return this.set("Accept",request.types[t]||t),this},Request.prototype.auth=function(t,e){var r=btoa(t+":"+e);return this.set("Authorization","Basic "+r),this},Request.prototype.query=function(t){return"string"!=typeof t&&(t=serialize(t)),t&&this._query.push(t),this},Request.prototype.field=function(t,e){return this._formData||(this._formData=new FormData),this._formData.append(t,e),this},Request.prototype.attach=function(t,e,r){return this._formData||(this._formData=new FormData),this._formData.append(t,e,r),this},Request.prototype.send=function(t){var e=isObject(t),r=this.getHeader("Content-Type");if(e&&isObject(this._data))for(var s in t)this._data[s]=t[s];else"string"==typeof t?(r||this.type("form"),r=this.getHeader("Content-Type"),"application/x-www-form-urlencoded"==r?this._data=this._data?this._data+"&"+t:t:this._data=(this._data||"")+t):this._data=t;return e?(r||this.type("json"),this):this},Request.prototype.callback=function(t,e){var r=this._callback;return this.clearTimeout(),2==r.length?r(t,e):t?this.emit("error",t):void r(e)},Request.prototype.crossDomainError=function(){var t=new Error("Origin is not allowed by Access-Control-Allow-Origin");t.crossDomain=!0,this.callback(t)},Request.prototype.timeoutError=function(){var t=this._timeout,e=new Error("timeout of "+t+"ms exceeded");e.timeout=t,this.callback(e)},Request.prototype.withCredentials=function(){return this._withCredentials=!0,this},Request.prototype.end=function(t){var e=this,r=this.xhr=getXHR(),s=this._query.join("&"),i=this._timeout,o=this._formData||this._data;if(this._callback=t||noop,r.onreadystatechange=function(){return 4==r.readyState?0==r.status?e.aborted?e.timeoutError():e.crossDomainError():void e.emit("end"):void 0},r.upload&&(r.upload.onprogress=function(t){t.percent=t.loaded/t.total*100,e.emit("progress",t)}),i&&!this._timer&&(this._timer=setTimeout(function(){e.abort()},i)),s&&(s=request.serializeObject(s),this.url+=~this.url.indexOf("?")?"&"+s:"?"+s),r.open(this.method,this.url,!0),this._withCredentials&&(r.withCredentials=!0),"GET"!=this.method&&"HEAD"!=this.method&&"string"!=typeof o&&!isHost(o)){var n=request.serialize[this.getHeader("Content-Type")];n&&(o=n(o))}for(var u in this.header)null!=this.header[u]&&r.setRequestHeader(u,this.header[u]);return this.emit("request",this),r.send(o),this},request.Request=Request,request.get=function(t,e,r){var s=request("GET",t);return"function"==typeof e&&(r=e,e=null),e&&s.query(e),r&&s.end(r),s},request.head=function(t,e,r){var s=request("HEAD",t);return"function"==typeof e&&(r=e,e=null),e&&s.send(e),r&&s.end(r),s},request.del=function(t,e){var r=request("DELETE",t);return e&&r.end(e),r},request.patch=function(t,e,r){var s=request("PATCH",t);return"function"==typeof e&&(r=e,e=null),e&&s.send(e),r&&s.end(r),s},request.post=function(t,e,r){var s=request("POST",t);return"function"==typeof e&&(r=e,e=null),e&&s.send(e),r&&s.end(r),s},request.put=function(t,e,r){var s=request("PUT",t);return"function"==typeof e&&(r=e,e=null),e&&s.send(e),r&&s.end(r),s},module.exports=request;


},{"emitter":87,"reduce":88}],87:[function(require,module,exports){
function Emitter(t){return t?mixin(t):void 0}function mixin(t){for(var e in Emitter.prototype)t[e]=Emitter.prototype[e];return t}module.exports=Emitter,Emitter.prototype.on=Emitter.prototype.addEventListener=function(t,e){return this._callbacks=this._callbacks||{},(this._callbacks[t]=this._callbacks[t]||[]).push(e),this},Emitter.prototype.once=function(t,e){function i(){r.off(t,i),e.apply(this,arguments)}var r=this;return this._callbacks=this._callbacks||{},i.fn=e,this.on(t,i),this},Emitter.prototype.off=Emitter.prototype.removeListener=Emitter.prototype.removeAllListeners=Emitter.prototype.removeEventListener=function(t,e){if(this._callbacks=this._callbacks||{},0==arguments.length)return this._callbacks={},this;var i=this._callbacks[t];if(!i)return this;if(1==arguments.length)return delete this._callbacks[t],this;for(var r,s=0;s<i.length;s++)if(r=i[s],r===e||r.fn===e){i.splice(s,1);break}return this},Emitter.prototype.emit=function(t){this._callbacks=this._callbacks||{};var e=[].slice.call(arguments,1),i=this._callbacks[t];if(i){i=i.slice(0);for(var r=0,s=i.length;s>r;++r)i[r].apply(this,e)}return this},Emitter.prototype.listeners=function(t){return this._callbacks=this._callbacks||{},this._callbacks[t]||[]},Emitter.prototype.hasListeners=function(t){return!!this.listeners(t).length};


},{}],88:[function(require,module,exports){
module.exports=function(l,n,e){for(var r=0,t=l.length,u=3==arguments.length?e:l[r++];t>r;)u=n.call(null,u,l[r],++r,l);return u};


},{}],89:[function(require,module,exports){
function convert(e,t){if("object"!=typeof e)throw new Error("resourceListing must be an object");Array.isArray(t)||(t=[]);var r={},n={},i={swagger:"2.0",info:buildInfo(e),paths:{}};return e.authorizations&&(i.securityDefinitions=buildSecurityDefinitions(e,r)),e.basePath&&assignPathComponents(e.basePath,i),extend(n,e.models),Array.isArray(e.apis)&&e.apis.forEach(function(t){Array.isArray(t.operations)&&(i.paths[t.path]=buildPath(t,e))}),t.forEach(function(e){e.basePath&&assignPathComponents(e.basePath,i),Array.isArray(e.apis)&&(e.apis.forEach(function(t){i.paths[t.path]=buildPath(t,e)}),Object.keys(e.models).length&&extend(n,transformAllModels(e.models)))}),Object.keys(n).length&&(i.definitions=transformAllModels(n)),i}function buildInfo(e){var t={version:e.apiVersion,title:"Title was not specified"};return"object"==typeof e.info&&(e.info.title&&(t.title=e.info.title),e.info.description&&(t.description=e.info.description),e.info.contact&&(t.contact={email:e.info.contact}),e.info.license&&(t.license={name:e.info.license,url:e.info.licenseUrl}),e.info.termsOfServiceUrl&&(t.termsOfService=e.info.termsOfServiceUrl)),t}function assignPathComponents(e,t){var r=urlParse(e);t.host=r.host,t.basePath=r.path,t.schemes=[r.protocol.substr(0,r.protocol.length-1)]}function processDataType(e){return e=clone(e),e.$ref&&-1===e.$ref.indexOf("#/definitions/")?e.$ref="#/definitions/"+e.$ref:e.items&&e.items.$ref&&-1===e.items.$ref.indexOf("#/definitions/")&&(e.items.$ref="#/definitions/"+e.items.$ref),"integer"===e.type?(e.minimum&&(e.minimum=parseInt(e.minimum,10)),e.maximum&&(e.maximum=parseInt(e.maximum,10))):(e.minimum&&(e.minimum=parseFloat(e.minimum)),e.maximum&&(e.maximum=parseFloat(e.maximum))),e.defaultValue&&("integer"===e.type?e["default"]=parseInt(e.defaultValue,10):"number"===e.type?e["default"]=parseFloat(e.defaultValue):e["default"]=e.defaultValue,delete e.defaultValue),e}function buildPath(e,t){var r={};return e.operations.forEach(function(e){var n=e.method.toLowerCase();r[n]=buildOperation(e,t.produces,t.consumes)}),r}function buildOperation(e,t,r){var n={responses:{},description:e.description||""};return e.summary&&(n.summary=e.summary),e.nickname&&(n.operationId=e.nickname),t&&(n.produces=t),r&&(n.consumes=r),Array.isArray(e.parameters)&&e.parameters.length&&(n.parameters=e.parameters.map(function(e){return buildParameter(processDataType(e))})),Array.isArray(e.responseMessages)&&e.responseMessages.forEach(function(e){n.responses[e.code]=buildResponse(e)}),Object.keys(n.responses).length||(n.responses={200:{description:"No response was specified"}}),n}function buildResponse(e){var t={};return t.description=e.message,t}function buildParameter(e){var t={"in":e.paramType,description:e.description,name:e.name,required:!!e.required},r=["string","number","boolean","integer","array","void","File"],n=["default","maximum","minimum","items"];return-1===r.indexOf(e.type)?t.schema={$ref:"#/definitions/"+e.type}:(t.type=e.type.toLowerCase(),n.forEach(function(r){"undefined"!=typeof e[r]&&(t[r]=e[r])}),"undefined"!=typeof e.defaultValue&&(t["default"]=e.defaultValue)),"form"===t["in"]&&(t["in"]="formData"),t}function buildSecurityDefinitions(e,t){var r={};return Object.keys(e.authorizations).forEach(function(n){var i=e.authorizations[n],o=function(e){var t=r[e||n]={type:i.type};return i.passAs&&(t["in"]=i.passAs),i.keyname&&(t.name=i.keyname),t};i.grantTypes?(t[n]=[],Object.keys(i.grantTypes).forEach(function(e){var r=i.grantTypes[e],s=n+"_"+e,a=o(s);switch(t[n].push(s),"implicit"===e?a.flow="implicit":a.flow="accessCode",e){case"implicit":a.authorizationUrl=r.loginEndpoint.url;break;case"authorization_code":a.authorizationUrl=r.tokenRequestEndpoint.url,a.tokenUrl=r.tokenEndpoint.url}i.scopes&&(a.scopes={},i.scopes.forEach(function(e){a.scopes[e.scope]=e.description||"Undescribed "+e.scope}))})):o()}),r}function transformModel(e){"object"==typeof e.properties&&Object.keys(e.properties).forEach(function(t){e.properties[t]=processDataType(e.properties[t])})}function transformAllModels(e){var t=clone(e);if("object"!=typeof e)throw new Error("models must be object");var r={};return Object.keys(t).forEach(function(e){var n=t[e];transformModel(n),n.subTypes&&(r[e]=n.subTypes,delete n.subTypes)}),Object.keys(r).forEach(function(e){r[e].forEach(function(r){var n=t[r];n&&(n.allOf=(n.allOf||[]).concat({$ref:"#/definitions/"+e}))})}),t}function extend(e,t){if("object"!=typeof e)throw new Error("source must be objects");"object"==typeof t&&Object.keys(t).forEach(function(r){e[r]=t[r]})}var urlParse=require("url").parse,clone=require("lodash.clonedeep");"undefined"==typeof window?module.exports=convert:window.SwaggerConverter=window.SwaggerConverter||{convert:convert};


},{"lodash.clonedeep":90,"url":10}],90:[function(require,module,exports){
function cloneDeep(e,a,l){return baseClone(e,!0,"function"==typeof a&&baseCreateCallback(a,l,1))}var baseClone=require("lodash._baseclone"),baseCreateCallback=require("lodash._basecreatecallback");module.exports=cloneDeep;


},{"lodash._baseclone":91,"lodash._basecreatecallback":113}],91:[function(require,module,exports){
function baseClone(s,e,a,r,l){if(a){var o=a(s);if("undefined"!=typeof o)return o}var t=isObject(s);if(!t)return s;var n=toString.call(s);if(!cloneableClasses[n])return s;var c=ctorByClass[n];switch(n){case boolClass:case dateClass:return new c(+s);case numberClass:case stringClass:return new c(s);case regexpClass:return o=c(s.source,reFlags.exec(s)),o.lastIndex=s.lastIndex,o}var C=isArray(s);if(e){var i=!r;r||(r=getArray()),l||(l=getArray());for(var b=r.length;b--;)if(r[b]==s)return l[b];o=C?c(s.length):{}}else o=C?slice(s):assign({},s);return C&&(hasOwnProperty.call(s,"index")&&(o.index=s.index),hasOwnProperty.call(s,"input")&&(o.input=s.input)),e?(r.push(s),l.push(o),(C?forEach:forOwn)(s,function(s,t){o[t]=baseClone(s,e,a,r,l)}),i&&(releaseArray(r),releaseArray(l)),o):o}var assign=require("lodash.assign"),forEach=require("lodash.foreach"),forOwn=require("lodash.forown"),getArray=require("lodash._getarray"),isArray=require("lodash.isarray"),isObject=require("lodash.isobject"),releaseArray=require("lodash._releasearray"),slice=require("lodash._slice"),reFlags=/\w*$/,argsClass="[object Arguments]",arrayClass="[object Array]",boolClass="[object Boolean]",dateClass="[object Date]",funcClass="[object Function]",numberClass="[object Number]",objectClass="[object Object]",regexpClass="[object RegExp]",stringClass="[object String]",cloneableClasses={};cloneableClasses[funcClass]=!1,cloneableClasses[argsClass]=cloneableClasses[arrayClass]=cloneableClasses[boolClass]=cloneableClasses[dateClass]=cloneableClasses[numberClass]=cloneableClasses[objectClass]=cloneableClasses[regexpClass]=cloneableClasses[stringClass]=!0;var objectProto=Object.prototype,toString=objectProto.toString,hasOwnProperty=objectProto.hasOwnProperty,ctorByClass={};ctorByClass[arrayClass]=Array,ctorByClass[boolClass]=Boolean,ctorByClass[dateClass]=Date,ctorByClass[funcClass]=Function,ctorByClass[objectClass]=Object,ctorByClass[numberClass]=Number,ctorByClass[regexpClass]=RegExp,ctorByClass[stringClass]=String,module.exports=baseClone;


},{"lodash._getarray":92,"lodash._releasearray":94,"lodash._slice":97,"lodash.assign":98,"lodash.foreach":103,"lodash.forown":104,"lodash.isarray":109,"lodash.isobject":111}],92:[function(require,module,exports){
function getArray(){return arrayPool.pop()||[]}var arrayPool=require("lodash._arraypool");module.exports=getArray;


},{"lodash._arraypool":93}],93:[function(require,module,exports){
var arrayPool=[];module.exports=arrayPool;


},{}],94:[function(require,module,exports){
function releaseArray(r){r.length=0,arrayPool.length<maxPoolSize&&arrayPool.push(r)}var arrayPool=require("lodash._arraypool"),maxPoolSize=require("lodash._maxpoolsize");module.exports=releaseArray;


},{"lodash._arraypool":95,"lodash._maxpoolsize":96}],95:[function(require,module,exports){
var arrayPool=[];module.exports=arrayPool;


},{}],96:[function(require,module,exports){
var maxPoolSize=40;module.exports=maxPoolSize;


},{}],97:[function(require,module,exports){
function slice(e,r,n){r||(r=0),"undefined"==typeof n&&(n=e?e.length:0);for(var o=-1,t=n-r||0,f=Array(0>t?0:t);++o<t;)f[o]=e[r+o];return f}module.exports=slice;


},{}],98:[function(require,module,exports){
var baseCreateCallback=require("lodash._basecreatecallback"),keys=require("lodash.keys"),objectTypes=require("lodash._objecttypes"),assign=function(e,a,r){var t,s=e,o=s;if(!s)return o;var n=arguments,f=0,l="number"==typeof r?2:n.length;if(l>3&&"function"==typeof n[l-2])var c=baseCreateCallback(n[--l-1],n[l--],2);else l>2&&"function"==typeof n[l-1]&&(c=n[--l]);for(;++f<l;)if(s=n[f],s&&objectTypes[typeof s])for(var y=-1,b=objectTypes[typeof s]&&keys(s),i=b?b.length:0;++y<i;)t=b[y],o[t]=c?c(o[t],s[t]):s[t];return o};module.exports=assign;


},{"lodash._basecreatecallback":113,"lodash._objecttypes":99,"lodash.keys":100}],99:[function(require,module,exports){
var objectTypes={"boolean":!1,"function":!0,object:!0,number:!1,string:!1,undefined:!1};module.exports=objectTypes;


},{}],100:[function(require,module,exports){
var isNative=require("lodash._isnative"),isObject=require("lodash.isobject"),shimKeys=require("lodash._shimkeys"),nativeKeys=isNative(nativeKeys=Object.keys)&&nativeKeys,keys=nativeKeys?function(e){return isObject(e)?nativeKeys(e):[]}:shimKeys;module.exports=keys;


},{"lodash._isnative":101,"lodash._shimkeys":102,"lodash.isobject":111}],101:[function(require,module,exports){
function isNative(t){return"function"==typeof t&&reNative.test(t)}var objectProto=Object.prototype,toString=objectProto.toString,reNative=RegExp("^"+String(toString).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/toString| for [^\]]+/g,".*?")+"$");module.exports=isNative;


},{}],102:[function(require,module,exports){
var objectTypes=require("lodash._objecttypes"),objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty,shimKeys=function(e){var r,o=e,t=[];if(!o)return t;if(!objectTypes[typeof e])return t;for(r in o)hasOwnProperty.call(o,r)&&t.push(r);return t};module.exports=shimKeys;


},{"lodash._objecttypes":99}],103:[function(require,module,exports){
function forEach(e,r,a){var o=-1,f=e?e.length:0;if(r=r&&"undefined"==typeof a?r:baseCreateCallback(r,a,3),"number"==typeof f)for(;++o<f&&r(e[o],o,e)!==!1;);else forOwn(e,r);return e}var baseCreateCallback=require("lodash._basecreatecallback"),forOwn=require("lodash.forown");module.exports=forEach;


},{"lodash._basecreatecallback":113,"lodash.forown":104}],104:[function(require,module,exports){
var baseCreateCallback=require("lodash._basecreatecallback"),keys=require("lodash.keys"),objectTypes=require("lodash._objecttypes"),forOwn=function(e,r,a){var t,o=e,s=o;if(!o)return s;if(!objectTypes[typeof o])return s;r=r&&"undefined"==typeof a?r:baseCreateCallback(r,a,3);for(var f=-1,l=objectTypes[typeof o]&&keys(o),n=l?l.length:0;++f<n;)if(t=l[f],r(o[t],t,e)===!1)return s;return s};module.exports=forOwn;


},{"lodash._basecreatecallback":113,"lodash._objecttypes":105,"lodash.keys":106}],105:[function(require,module,exports){
var objectTypes={"boolean":!1,"function":!0,object:!0,number:!1,string:!1,undefined:!1};module.exports=objectTypes;


},{}],106:[function(require,module,exports){
var isNative=require("lodash._isnative"),isObject=require("lodash.isobject"),shimKeys=require("lodash._shimkeys"),nativeKeys=isNative(nativeKeys=Object.keys)&&nativeKeys,keys=nativeKeys?function(e){return isObject(e)?nativeKeys(e):[]}:shimKeys;module.exports=keys;


},{"lodash._isnative":107,"lodash._shimkeys":108,"lodash.isobject":111}],107:[function(require,module,exports){
function isNative(t){return"function"==typeof t&&reNative.test(t)}var objectProto=Object.prototype,toString=objectProto.toString,reNative=RegExp("^"+String(toString).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/toString| for [^\]]+/g,".*?")+"$");module.exports=isNative;


},{}],108:[function(require,module,exports){
var objectTypes=require("lodash._objecttypes"),objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty,shimKeys=function(e){var r,o=e,t=[];if(!o)return t;if(!objectTypes[typeof e])return t;for(r in o)hasOwnProperty.call(o,r)&&t.push(r);return t};module.exports=shimKeys;


},{"lodash._objecttypes":105}],109:[function(require,module,exports){
var isNative=require("lodash._isnative"),arrayClass="[object Array]",objectProto=Object.prototype,toString=objectProto.toString,nativeIsArray=isNative(nativeIsArray=Array.isArray)&&nativeIsArray,isArray=nativeIsArray||function(r){return r&&"object"==typeof r&&"number"==typeof r.length&&toString.call(r)==arrayClass||!1};module.exports=isArray;


},{"lodash._isnative":110}],110:[function(require,module,exports){
function isNative(t){return"function"==typeof t&&reNative.test(t)}var objectProto=Object.prototype,toString=objectProto.toString,reNative=RegExp("^"+String(toString).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/toString| for [^\]]+/g,".*?")+"$");module.exports=isNative;


},{}],111:[function(require,module,exports){
function isObject(e){return!(!e||!objectTypes[typeof e])}var objectTypes=require("lodash._objecttypes");module.exports=isObject;


},{"lodash._objecttypes":112}],112:[function(require,module,exports){
var objectTypes={"boolean":!1,"function":!0,object:!0,number:!1,string:!1,undefined:!1};module.exports=objectTypes;


},{}],113:[function(require,module,exports){
function baseCreateCallback(e,t,n){if("function"!=typeof e)return identity;if("undefined"==typeof t||!("prototype"in e))return e;var r=e.__bindData__;if("undefined"==typeof r&&(support.funcNames&&(r=!e.name),r=r||!support.funcDecomp,!r)){var i=fnToString.call(e);support.funcNames||(r=!reFuncName.test(i)),r||(r=reThis.test(i),setBindData(e,r))}if(r===!1||r!==!0&&1&r[1])return e;switch(n){case 1:return function(n){return e.call(t,n)};case 2:return function(n,r){return e.call(t,n,r)};case 3:return function(n,r,i){return e.call(t,n,r,i)};case 4:return function(n,r,i,a){return e.call(t,n,r,i,a)}}return bind(e,t)}var bind=require("lodash.bind"),identity=require("lodash.identity"),setBindData=require("lodash._setbinddata"),support=require("lodash.support"),reFuncName=/^\s*function[ \n\r\t]+\w/,reThis=/\bthis\b/,fnToString=Function.prototype.toString;module.exports=baseCreateCallback;


},{"lodash._setbinddata":114,"lodash.bind":117,"lodash.identity":133,"lodash.support":134}],114:[function(require,module,exports){
var isNative=require("lodash._isnative"),noop=require("lodash.noop"),descriptor={configurable:!1,enumerable:!1,value:null,writable:!1},defineProperty=function(){try{var e={},r=isNative(r=Object.defineProperty)&&r,t=r(e,e,e)&&r}catch(i){}return t}(),setBindData=defineProperty?function(e,r){descriptor.value=r,defineProperty(e,"__bindData__",descriptor)}:noop;module.exports=setBindData;


},{"lodash._isnative":115,"lodash.noop":116}],115:[function(require,module,exports){
function isNative(t){return"function"==typeof t&&reNative.test(t)}var objectProto=Object.prototype,toString=objectProto.toString,reNative=RegExp("^"+String(toString).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/toString| for [^\]]+/g,".*?")+"$");module.exports=isNative;


},{}],116:[function(require,module,exports){
function noop(){}module.exports=noop;


},{}],117:[function(require,module,exports){
function bind(e,r){return arguments.length>2?createWrapper(e,17,slice(arguments,2),null,r):createWrapper(e,1,null,null,r)}var createWrapper=require("lodash._createwrapper"),slice=require("lodash._slice");module.exports=bind;


},{"lodash._createwrapper":118,"lodash._slice":132}],118:[function(require,module,exports){
function createWrapper(e,r,a,i,s,p){var n=1&r,t=2&r,u=4&r,l=16&r,c=32&r;if(!t&&!isFunction(e))throw new TypeError;l&&!a.length&&(r&=-17,l=a=!1),c&&!i.length&&(r&=-33,c=i=!1);var h=e&&e.__bindData__;if(h&&h!==!0)return h=slice(h),h[2]&&(h[2]=slice(h[2])),h[3]&&(h[3]=slice(h[3])),!n||1&h[1]||(h[4]=s),!n&&1&h[1]&&(r|=8),!u||4&h[1]||(h[5]=p),l&&push.apply(h[2]||(h[2]=[]),a),c&&unshift.apply(h[3]||(h[3]=[]),i),h[1]|=r,createWrapper.apply(null,h);var o=1==r||17===r?baseBind:baseCreateWrapper;return o([e,r,a,i,s,p])}var baseBind=require("lodash._basebind"),baseCreateWrapper=require("lodash._basecreatewrapper"),isFunction=require("lodash.isfunction"),slice=require("lodash._slice"),arrayRef=[],push=arrayRef.push,unshift=arrayRef.unshift;module.exports=createWrapper;


},{"lodash._basebind":119,"lodash._basecreatewrapper":125,"lodash._slice":132,"lodash.isfunction":131}],119:[function(require,module,exports){
function baseBind(e){function a(){if(s){var e=slice(s);push.apply(e,arguments)}if(this instanceof a){var i=baseCreate(r.prototype),n=r.apply(i,e||arguments);return isObject(n)?n:i}return r.apply(t,e||arguments)}var r=e[0],s=e[2],t=e[4];return setBindData(a,e),a}var baseCreate=require("lodash._basecreate"),isObject=require("lodash.isobject"),setBindData=require("lodash._setbinddata"),slice=require("lodash._slice"),arrayRef=[],push=arrayRef.push;module.exports=baseBind;


},{"lodash._basecreate":120,"lodash._setbinddata":114,"lodash._slice":132,"lodash.isobject":123}],120:[function(require,module,exports){
(function (global){
function baseCreate(e,t){return isObject(e)?nativeCreate(e):{}}var isNative=require("lodash._isnative"),isObject=require("lodash.isobject"),noop=require("lodash.noop"),nativeCreate=isNative(nativeCreate=Object.create)&&nativeCreate;nativeCreate||(baseCreate=function(){function e(){}return function(t){if(isObject(t)){e.prototype=t;var a=new e;e.prototype=null}return a||global.Object()}}()),module.exports=baseCreate;


}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"lodash._isnative":121,"lodash.isobject":123,"lodash.noop":122}],121:[function(require,module,exports){
function isNative(t){return"function"==typeof t&&reNative.test(t)}var objectProto=Object.prototype,toString=objectProto.toString,reNative=RegExp("^"+String(toString).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/toString| for [^\]]+/g,".*?")+"$");module.exports=isNative;


},{}],122:[function(require,module,exports){
function noop(){}module.exports=noop;


},{}],123:[function(require,module,exports){
function isObject(e){return!(!e||!objectTypes[typeof e])}var objectTypes=require("lodash._objecttypes");module.exports=isObject;


},{"lodash._objecttypes":124}],124:[function(require,module,exports){
var objectTypes={"boolean":!1,"function":!0,object:!0,number:!1,string:!1,undefined:!1};module.exports=objectTypes;


},{}],125:[function(require,module,exports){
function baseCreateWrapper(e){function a(){var e=n?p:this;if(t){var b=slice(t);push.apply(b,arguments)}if((i||o)&&(b||(b=slice(arguments)),i&&push.apply(b,i),o&&b.length<u))return s|=16,baseCreateWrapper([r,c?s:-4&s,b,null,p,u]);if(b||(b=arguments),l&&(r=e[h]),this instanceof a){e=baseCreate(r.prototype);var d=r.apply(e,b);return isObject(d)?d:e}return r.apply(e,b)}var r=e[0],s=e[1],t=e[2],i=e[3],p=e[4],u=e[5],n=1&s,l=2&s,o=4&s,c=8&s,h=r;return setBindData(a,e),a}var baseCreate=require("lodash._basecreate"),isObject=require("lodash.isobject"),setBindData=require("lodash._setbinddata"),slice=require("lodash._slice"),arrayRef=[],push=arrayRef.push;module.exports=baseCreateWrapper;


},{"lodash._basecreate":126,"lodash._setbinddata":114,"lodash._slice":132,"lodash.isobject":129}],126:[function(require,module,exports){
(function (global){
function baseCreate(e,t){return isObject(e)?nativeCreate(e):{}}var isNative=require("lodash._isnative"),isObject=require("lodash.isobject"),noop=require("lodash.noop"),nativeCreate=isNative(nativeCreate=Object.create)&&nativeCreate;nativeCreate||(baseCreate=function(){function e(){}return function(t){if(isObject(t)){e.prototype=t;var a=new e;e.prototype=null}return a||global.Object()}}()),module.exports=baseCreate;


}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"lodash._isnative":127,"lodash.isobject":129,"lodash.noop":128}],127:[function(require,module,exports){
function isNative(t){return"function"==typeof t&&reNative.test(t)}var objectProto=Object.prototype,toString=objectProto.toString,reNative=RegExp("^"+String(toString).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/toString| for [^\]]+/g,".*?")+"$");module.exports=isNative;


},{}],128:[function(require,module,exports){
function noop(){}module.exports=noop;


},{}],129:[function(require,module,exports){
function isObject(e){return!(!e||!objectTypes[typeof e])}var objectTypes=require("lodash._objecttypes");module.exports=isObject;


},{"lodash._objecttypes":130}],130:[function(require,module,exports){
var objectTypes={"boolean":!1,"function":!0,object:!0,number:!1,string:!1,undefined:!1};module.exports=objectTypes;


},{}],131:[function(require,module,exports){
function isFunction(n){return"function"==typeof n}module.exports=isFunction;


},{}],132:[function(require,module,exports){
function slice(e,r,n){r||(r=0),"undefined"==typeof n&&(n=e?e.length:0);for(var o=-1,t=n-r||0,f=Array(0>t?0:t);++o<t;)f[o]=e[r+o];return f}module.exports=slice;


},{}],133:[function(require,module,exports){
function identity(t){return t}module.exports=identity;


},{}],134:[function(require,module,exports){
(function (global){
var isNative=require("lodash._isnative"),reThis=/\bthis\b/,support={};support.funcDecomp=!isNative(global.WinRTError)&&reThis.test(function(){return this}),support.funcNames="string"==typeof Function.name,module.exports=support;


}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"lodash._isnative":135}],135:[function(require,module,exports){
function isNative(t){return"function"==typeof t&&reNative.test(t)}var objectProto=Object.prototype,toString=objectProto.toString,reNative=RegExp("^"+String(toString).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/toString| for [^\]]+/g,".*?")+"$");module.exports=isNative;


},{}],136:[function(require,module,exports){
function Traverse(e){this.value=e}function walk(e,t,r){var o=[],n=[],a=!0;return function i(e){function c(){if("object"==typeof l.node&&null!==l.node){l.keys&&l.node_===l.node||(l.keys=objectKeys(l.node)),l.isLeaf=0==l.keys.length;for(var t=0;t<n.length;t++)if(n[t].node_===e){l.circular=n[t];break}}else l.isLeaf=!0,l.keys=null;l.notLeaf=!l.isLeaf,l.notRoot=!l.isRoot}var s=r?copy(e):e,u={},f=!0,l={node:s,node_:e,path:[].concat(o),parent:n[n.length-1],parents:n,key:o.slice(-1)[0],isRoot:0===o.length,level:o.length,circular:null,update:function(e,t){l.isRoot||(l.parent.node[l.key]=e),l.node=e,t&&(f=!1)},"delete":function(e){delete l.parent.node[l.key],e&&(f=!1)},remove:function(e){isArray(l.parent.node)?l.parent.node.splice(l.key,1):delete l.parent.node[l.key],e&&(f=!1)},keys:null,before:function(e){u.before=e},after:function(e){u.after=e},pre:function(e){u.pre=e},post:function(e){u.post=e},stop:function(){a=!1},block:function(){f=!1}};if(!a)return l;c();var p=t.call(l,l.node);return void 0!==p&&l.update&&l.update(p),u.before&&u.before.call(l,l.node),f?("object"!=typeof l.node||null===l.node||l.circular||(n.push(l),c(),forEach(l.keys,function(e,t){o.push(e),u.pre&&u.pre.call(l,l.node[e],e);var n=i(l.node[e]);r&&hasOwnProperty.call(l.node,e)&&(l.node[e]=n.node),n.isLast=t==l.keys.length-1,n.isFirst=0==t,u.post&&u.post.call(l,n),o.pop()}),n.pop()),u.after&&u.after.call(l,l.node),l):l}(e).node}function copy(e){if("object"==typeof e&&null!==e){var t;if(isArray(e))t=[];else if(isDate(e))t=new Date(e.getTime?e.getTime():e);else if(isRegExp(e))t=new RegExp(e);else if(isError(e))t={message:e.message};else if(isBoolean(e))t=new Boolean(e);else if(isNumber(e))t=new Number(e);else if(isString(e))t=new String(e);else if(Object.create&&Object.getPrototypeOf)t=Object.create(Object.getPrototypeOf(e));else if(e.constructor===Object)t={};else{var r=e.constructor&&e.constructor.prototype||e.__proto__||{},o=function(){};o.prototype=r,t=new o}return forEach(objectKeys(e),function(r){t[r]=e[r]}),t}return e}function toS(e){return Object.prototype.toString.call(e)}function isDate(e){return"[object Date]"===toS(e)}function isRegExp(e){return"[object RegExp]"===toS(e)}function isError(e){return"[object Error]"===toS(e)}function isBoolean(e){return"[object Boolean]"===toS(e)}function isNumber(e){return"[object Number]"===toS(e)}function isString(e){return"[object String]"===toS(e)}var traverse=module.exports=function(e){return new Traverse(e)};Traverse.prototype.get=function(e){for(var t=this.value,r=0;r<e.length;r++){var o=e[r];if(!t||!hasOwnProperty.call(t,o)){t=void 0;break}t=t[o]}return t},Traverse.prototype.has=function(e){for(var t=this.value,r=0;r<e.length;r++){var o=e[r];if(!t||!hasOwnProperty.call(t,o))return!1;t=t[o]}return!0},Traverse.prototype.set=function(e,t){for(var r=this.value,o=0;o<e.length-1;o++){var n=e[o];hasOwnProperty.call(r,n)||(r[n]={}),r=r[n]}return r[e[o]]=t,t},Traverse.prototype.map=function(e){return walk(this.value,e,!0)},Traverse.prototype.forEach=function(e){return this.value=walk(this.value,e,!1),this.value},Traverse.prototype.reduce=function(e,t){var r=1===arguments.length,o=r?this.value:t;return this.forEach(function(t){this.isRoot&&r||(o=e.call(this,o,t))}),o},Traverse.prototype.paths=function(){var e=[];return this.forEach(function(t){e.push(this.path)}),e},Traverse.prototype.nodes=function(){var e=[];return this.forEach(function(t){e.push(this.node)}),e},Traverse.prototype.clone=function(){var e=[],t=[];return function r(o){for(var n=0;n<e.length;n++)if(e[n]===o)return t[n];if("object"==typeof o&&null!==o){var a=copy(o);return e.push(o),t.push(a),forEach(objectKeys(o),function(e){a[e]=r(o[e])}),e.pop(),t.pop(),a}return o}(this.value)};var objectKeys=Object.keys||function(e){var t=[];for(var r in e)t.push(r);return t},isArray=Array.isArray||function(e){return"[object Array]"===Object.prototype.toString.call(e)},forEach=function(e,t){if(e.forEach)return e.forEach(t);for(var r=0;r<e.length;r++)t(e[r],r,e)};forEach(objectKeys(Traverse.prototype),function(e){traverse[e]=function(t){var r=[].slice.call(arguments,1),o=new Traverse(t);return o[e].apply(o,r)}});var hasOwnProperty=Object.hasOwnProperty||function(e,t){return t in e};


},{}],137:[function(require,module,exports){
!function(t,e){"undefined"!=typeof exports&&"undefined"!=typeof module?module.exports=e():"function"==typeof define&&"object"==typeof define.amd?define(e):this[t]=e()}("validator",function(t){"use strict";function e(t,e){t=t||{};for(var r in e)"undefined"==typeof t[r]&&(t[r]=e[r]);return t}function r(t){var e="(\\"+t.symbol.replace(/\./g,"\\.")+")"+(t.require_symbol?"":"?"),r="-?",n="[1-9]\\d*",i="[1-9]\\d{0,2}(\\"+t.thousands_separator+"\\d{3})*",u=["0",n,i],o="("+u.join("|")+")?",a="(\\"+t.decimal_separator+"\\d{2})?",s=o+a;return t.allow_negatives&&!t.parens_for_negatives&&(t.negative_sign_after_digits?s+=r:t.negative_sign_before_digits&&(s=r+s)),t.allow_negative_sign_placeholder?s="( (?!\\-))?"+s:t.allow_space_after_symbol?s=" ?"+s:t.allow_space_after_digits&&(s+="( (?!$))?"),t.symbol_after_digits?s+=e:s=e+s,t.allow_negatives&&(t.parens_for_negatives?s="(\\("+s+"\\)|"+s+")":t.negative_sign_before_digits||t.negative_sign_after_digits||(s=r+s)),new RegExp("^(?!-? )(?=.*\\d)"+s+"$")}t={version:"3.38.0"};var n=/^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e])|(\\[\x01-\x09\x0b\x0c\x0d-\x7f])))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))$/i,i=/^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))$/i,u=/^(?:[a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~\.]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(?:[a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~\.]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]|\s)*<(.+)>$/i,o=/^(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|6(?:011|5[0-9][0-9])[0-9]{12}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|(?:2131|1800|35\d{3})\d{11})$/,a=/^[A-Z]{2}[0-9A-Z]{9}[0-9]$/,s=/^(?:[0-9]{9}X|[0-9]{10})$/,l=/^(?:[0-9]{13})$/,f=/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/,c=/^[0-9A-F]{1,4}$/i,F={3:/^[0-9A-F]{8}-[0-9A-F]{4}-3[0-9A-F]{3}-[0-9A-F]{4}-[0-9A-F]{12}$/i,4:/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,5:/^[0-9A-F]{8}-[0-9A-F]{4}-5[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,all:/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i},p=/^[A-Z]+$/i,g=/^[0-9A-Z]+$/i,d=/^[-+]?[0-9]+$/,x=/^(?:[-+]?(?:0|[1-9][0-9]*))$/,_=/^(?:[-+]?(?:[0-9]+))?(?:\.[0-9]*)?(?:[eE][\+\-]?(?:[0-9]+))?$/,h=/^[0-9A-F]+$/i,A=/^#?([0-9A-F]{3}|[0-9A-F]{6})$/i,v=/^[\x00-\x7F]+$/,$=/[^\x00-\x7F]/,D=/[^\u0020-\u007E\uFF61-\uFF9F\uFFA0-\uFFDC\uFFE8-\uFFEE0-9a-zA-Z]/,w=/[\u0020-\u007E\uFF61-\uFF9F\uFFA0-\uFFDC\uFFE8-\uFFEE0-9a-zA-Z]/,b=/[\uD800-\uDBFF][\uDC00-\uDFFF]/,m=/^(?:[A-Z0-9+\/]{4})*(?:[A-Z0-9+\/]{2}==|[A-Z0-9+\/]{3}=|[A-Z0-9+\/]{4})$/i,y={"zh-CN":/^(\+?0?86\-?)?1[345789]\d{9}$/,"en-ZA":/^(\+?27|0)\d{9}$/,"en-AU":/^(\+?61|0)4\d{8}$/,"en-HK":/^(\+?852\-?)?[569]\d{3}\-?\d{4}$/,"fr-FR":/^(\+?33|0)[67]\d{8}$/,"pt-PT":/^(\+351)?9[1236]\d{7}$/,"el-GR":/^(\+30)?((2\d{9})|(69\d{8}))$/,"en-GB":/^(\+?44|0)7\d{9}$/,"en-US":/^(\+?1)?[2-9]\d{2}[2-9](?!11)\d{6}$/,"en-ZM":/^(\+26)?09[567]\d{7}$/};t.extend=function(e,r){t[e]=function(){var e=Array.prototype.slice.call(arguments);return e[0]=t.toString(e[0]),r.apply(t,e)}},t.init=function(){for(var e in t)"function"==typeof t[e]&&"toString"!==e&&"toDate"!==e&&"extend"!==e&&"init"!==e&&t.extend(e,t[e])},t.toString=function(t){return"object"==typeof t&&null!==t&&t.toString?t=t.toString():null===t||"undefined"==typeof t||isNaN(t)&&!t.length?t="":"string"!=typeof t&&(t+=""),t},t.toDate=function(t){return"[object Date]"===Object.prototype.toString.call(t)?t:(t=Date.parse(t),isNaN(t)?null:new Date(t))},t.toFloat=function(t){return parseFloat(t)},t.toInt=function(t,e){return parseInt(t,e||10)},t.toBoolean=function(t,e){return e?"1"===t||"true"===t:"0"!==t&&"false"!==t&&""!==t},t.equals=function(e,r){return e===t.toString(r)},t.contains=function(e,r){return e.indexOf(t.toString(r))>=0},t.matches=function(t,e,r){return"[object RegExp]"!==Object.prototype.toString.call(e)&&(e=new RegExp(e,r)),e.test(t)};var E={allow_display_name:!1,allow_utf8_local_part:!0,require_tld:!0};t.isEmail=function(r,o){if(o=e(o,E),o.allow_display_name){var a=r.match(u);a&&(r=a[1])}else if(/\s/.test(r))return!1;var s=r.split("@"),l=s.pop(),f=s.join("@");return t.isFQDN(l,{require_tld:o.require_tld})?o.allow_utf8_local_part?i.test(f):n.test(f):!1};var C={protocols:["http","https","ftp"],require_tld:!0,require_protocol:!1,allow_underscores:!1,allow_trailing_dot:!1,allow_protocol_relative_urls:!1};t.isURL=function(r,n){if(!r||r.length>=2083||/\s/.test(r))return!1;if(0===r.indexOf("mailto:"))return!1;n=e(n,C);var i,u,o,a,s,l,f;if(f=r.split("://"),f.length>1){if(i=f.shift(),-1===n.protocols.indexOf(i))return!1}else{if(n.require_protocol)return!1;n.allow_protocol_relative_urls&&"//"===r.substr(0,2)&&(f[0]=r.substr(2))}return r=f.join("://"),f=r.split("#"),r=f.shift(),f=r.split("?"),r=f.shift(),f=r.split("/"),r=f.shift(),f=r.split("@"),f.length>1&&(u=f.shift(),u.indexOf(":")>=0&&u.split(":").length>2)?!1:(a=f.join("@"),f=a.split(":"),o=f.shift(),f.length&&(l=f.join(":"),s=parseInt(l,10),!/^[0-9]+$/.test(l)||0>=s||s>65535)?!1:t.isIP(o)||t.isFQDN(o,n)||"localhost"===o?n.host_whitelist&&-1===n.host_whitelist.indexOf(o)?!1:n.host_blacklist&&-1!==n.host_blacklist.indexOf(o)?!1:!0:!1)},t.isIP=function(e,r){if(r=t.toString(r),!r)return t.isIP(e,4)||t.isIP(e,6);if("4"===r){if(!f.test(e))return!1;var n=e.split(".").sort(function(t,e){return t-e});return n[3]<=255}if("6"===r){var i=e.split(":"),u=!1;if(i.length>8)return!1;if("::"===e)return!0;"::"===e.substr(0,2)?(i.shift(),i.shift(),u=!0):"::"===e.substr(e.length-2)&&(i.pop(),i.pop(),u=!0);for(var o=0;o<i.length;++o)if(""===i[o]&&o>0&&o<i.length-1){if(u)return!1;u=!0}else if(!c.test(i[o]))return!1;return u?i.length>=1:8===i.length}return!1};var I={require_tld:!0,allow_underscores:!1,allow_trailing_dot:!1};t.isFQDN=function(t,r){r=e(r,I),r.allow_trailing_dot&&"."===t[t.length-1]&&(t=t.substring(0,t.length-1));var n=t.split(".");if(r.require_tld){var i=n.pop();if(!n.length||!/^([a-z\u00a1-\uffff]{2,}|xn[a-z0-9-]{2,})$/i.test(i))return!1}for(var u,o=0;o<n.length;o++){if(u=n[o],r.allow_underscores){if(u.indexOf("__")>=0)return!1;u=u.replace(/_/g,"")}if(!/^[a-z\u00a1-\uffff0-9-]+$/i.test(u))return!1;if("-"===u[0]||"-"===u[u.length-1]||u.indexOf("---")>=0)return!1}return!0},t.isAlpha=function(t){return p.test(t)},t.isAlphanumeric=function(t){return g.test(t)},t.isNumeric=function(t){return d.test(t)},t.isHexadecimal=function(t){return h.test(t)},t.isHexColor=function(t){return A.test(t)},t.isLowercase=function(t){return t===t.toLowerCase()},t.isUppercase=function(t){return t===t.toUpperCase()},t.isInt=function(t){return x.test(t)},t.isFloat=function(t){return""!==t&&_.test(t)},t.isDivisibleBy=function(e,r){return t.toFloat(e)%t.toInt(r)===0},t.isNull=function(t){return 0===t.length},t.isLength=function(t,e,r){var n=t.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g)||[],i=t.length-n.length;return i>=e&&("undefined"==typeof r||r>=i)},t.isByteLength=function(t,e,r){return t.length>=e&&("undefined"==typeof r||t.length<=r)},t.isUUID=function(t,e){var r=F[e?e:"all"];return r&&r.test(t)},t.isDate=function(t){return!isNaN(Date.parse(t))},t.isAfter=function(e,r){var n=t.toDate(r||new Date),i=t.toDate(e);return!!(i&&n&&i>n)},t.isBefore=function(e,r){var n=t.toDate(r||new Date),i=t.toDate(e);return i&&n&&n>i},t.isIn=function(e,r){var n;if("[object Array]"===Object.prototype.toString.call(r)){var i=[];for(n in r)i[n]=t.toString(r[n]);return i.indexOf(e)>=0}return"object"==typeof r?r.hasOwnProperty(e):r&&"function"==typeof r.indexOf?r.indexOf(e)>=0:!1},t.isCreditCard=function(t){var e=t.replace(/[^0-9]+/g,"");if(!o.test(e))return!1;for(var r,n,i,u=0,a=e.length-1;a>=0;a--)r=e.substring(a,a+1),n=parseInt(r,10),i?(n*=2,u+=n>=10?n%10+1:n):u+=n,i=!i;return!!(u%10===0?e:!1)},t.isISIN=function(t){if(!a.test(t))return!1;for(var e,r,n=t.replace(/[A-Z]/g,function(t){return parseInt(t,36)}),i=0,u=!0,o=n.length-2;o>=0;o--)e=n.substring(o,o+1),r=parseInt(e,10),u?(r*=2,i+=r>=10?r+1:r):i+=r,u=!u;return parseInt(t.substr(t.length-1),10)===(1e4-i)%10},t.isISBN=function(e,r){if(r=t.toString(r),!r)return t.isISBN(e,10)||t.isISBN(e,13);var n,i=e.replace(/[\s-]+/g,""),u=0;if("10"===r){if(!s.test(i))return!1;for(n=0;9>n;n++)u+=(n+1)*i.charAt(n);if(u+="X"===i.charAt(9)?100:10*i.charAt(9),u%11===0)return!!i}else if("13"===r){if(!l.test(i))return!1;var o=[1,3];for(n=0;12>n;n++)u+=o[n%2]*i.charAt(n);if(i.charAt(12)-(10-u%10)%10===0)return!!i}return!1},t.isMobilePhone=function(t,e){return e in y?y[e].test(t):!1};var S={symbol:"$",require_symbol:!1,allow_space_after_symbol:!1,symbol_after_digits:!1,allow_negatives:!0,parens_for_negatives:!1,negative_sign_before_digits:!1,negative_sign_after_digits:!1,allow_negative_sign_placeholder:!1,thousands_separator:",",decimal_separator:".",allow_space_after_digits:!1};t.isCurrency=function(t,n){return n=e(n,S),r(n).test(t)},t.isJSON=function(t){try{JSON.parse(t)}catch(e){return!1}return!0},t.isMultibyte=function(t){return $.test(t)},t.isAscii=function(t){return v.test(t)},t.isFullWidth=function(t){return D.test(t)},t.isHalfWidth=function(t){return w.test(t)},t.isVariableWidth=function(t){return D.test(t)&&w.test(t)},t.isSurrogatePair=function(t){return b.test(t)},t.isBase64=function(t){return m.test(t)},t.isMongoId=function(e){return t.isHexadecimal(e)&&24===e.length},t.ltrim=function(t,e){var r=e?new RegExp("^["+e+"]+","g"):/^\s+/g;return t.replace(r,"")},t.rtrim=function(t,e){var r=e?new RegExp("["+e+"]+$","g"):/\s+$/g;return t.replace(r,"")},t.trim=function(t,e){var r=e?new RegExp("^["+e+"]+|["+e+"]+$","g"):/^\s+|\s+$/g;return t.replace(r,"")},t.escape=function(t){return t.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/'/g,"&#x27;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\//g,"&#x2F;").replace(/\`/g,"&#96;")},t.stripLow=function(e,r){var n=r?"\\x00-\\x09\\x0B\\x0C\\x0E-\\x1F\\x7F":"\\x00-\\x1F\\x7F";return t.blacklist(e,n)},t.whitelist=function(t,e){return t.replace(new RegExp("[^"+e+"]+","g"),"")},t.blacklist=function(t,e){return t.replace(new RegExp("["+e+"]+","g"),"")};var N={lowercase:!0};return t.normalizeEmail=function(r,n){if(n=e(n,N),!t.isEmail(r))return!1;var i=r.split("@",2);if(i[1]=i[1].toLowerCase(),"gmail.com"===i[1]||"googlemail.com"===i[1]){if(i[0]=i[0].toLowerCase().replace(/\./g,""),"+"===i[0][0])return!1;i[0]=i[0].split("+")[0],i[1]="gmail.com"}else n.lowercase&&(i[0]=i[0].toLowerCase());return i.join("@")},t.init(),t});


},{}],138:[function(require,module,exports){
"use strict";module.exports={INVALID_TYPE:"Expected type {0} but found type {1}",INVALID_FORMAT:"Object didn't pass validation for format {0}: {1}",ENUM_MISMATCH:"No enum match for: {0}",ANY_OF_MISSING:"Data does not match any schemas from 'anyOf'",ONE_OF_MISSING:"Data does not match any schemas from 'oneOf'",ONE_OF_MULTIPLE:"Data is valid against more than one schema from 'oneOf'",NOT_PASSED:"Data matches schema from 'not'",ARRAY_LENGTH_SHORT:"Array is too short ({0}), minimum {1}",ARRAY_LENGTH_LONG:"Array is too long ({0}), maximum {1}",ARRAY_UNIQUE:"Array items are not unique (indexes {0} and {1})",ARRAY_ADDITIONAL_ITEMS:"Additional items not allowed",MULTIPLE_OF:"Value {0} is not a multiple of {1}",MINIMUM:"Value {0} is less than minimum {1}",MINIMUM_EXCLUSIVE:"Value {0} is equal or less than exclusive minimum {1}",MAXIMUM:"Value {0} is greater than maximum {1}",MAXIMUM_EXCLUSIVE:"Value {0} is equal or greater than exclusive maximum {1}",OBJECT_PROPERTIES_MINIMUM:"Too few properties defined ({0}), minimum {1}",OBJECT_PROPERTIES_MAXIMUM:"Too many properties defined ({0}), maximum {1}",OBJECT_MISSING_REQUIRED_PROPERTY:"Missing required property: {0}",OBJECT_ADDITIONAL_PROPERTIES:"Additional properties not allowed: {0}",OBJECT_DEPENDENCY_KEY:"Dependency failed - key must exist: {0} (due to key: {1})",MIN_LENGTH:"String is too short ({0} chars), minimum {1}",MAX_LENGTH:"String is too long ({0} chars), maximum {1}",PATTERN:"String does not match pattern {0}: {1}",KEYWORD_TYPE_EXPECTED:"Keyword '{0}' is expected to be of type '{1}'",KEYWORD_UNDEFINED_STRICT:"Keyword '{0}' must be defined in strict mode",KEYWORD_UNEXPECTED:"Keyword '{0}' is not expected to appear in the schema",KEYWORD_MUST_BE:"Keyword '{0}' must be {1}",KEYWORD_DEPENDENCY:"Keyword '{0}' requires keyword '{1}'",KEYWORD_PATTERN:"Keyword '{0}' is not a valid RegExp pattern: {1}",KEYWORD_VALUE_TYPE:"Each element of keyword '{0}' array must be a '{1}'",UNKNOWN_FORMAT:"There is no validation function for format '{0}'",CUSTOM_MODE_FORCE_PROPERTIES:"{0} must define at least one property if present",REF_UNRESOLVED:"Reference has not been resolved during compilation: {0}",UNRESOLVABLE_REFERENCE:"Reference could not be resolved: {0}",SCHEMA_NOT_REACHABLE:"Validator was not able to read schema with uri: {0}",SCHEMA_TYPE_EXPECTED:"Schema is expected to be of type 'object'",SCHEMA_NOT_AN_OBJECT:"Schema is not an object: {0}",ASYNC_TIMEOUT:"{0} asynchronous task(s) have timed out after {1} ms",PARENT_SCHEMA_VALIDATION_FAILED:"Schema failed to validate against its parent schema, see inner errors for details.",REMOTE_NOT_VALID:"Remote reference didn't compile successfully: {0}"};


},{}],139:[function(require,module,exports){
var validator=require("validator"),FormatValidators={date:function(t){if("string"!=typeof t)return!0;var r=/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(t);return null===r?!1:r[2]<"01"||r[2]>"12"||r[3]<"01"||r[3]>"31"?!1:!0},"date-time":function(t){if("string"!=typeof t)return!0;var r=t.toLowerCase().split("t");if(!FormatValidators.date(r[0]))return!1;var i=/^([0-9]{2}):([0-9]{2}):([0-9]{2})(.[0-9]+)?(z|([+-][0-9]{2}:[0-9]{2}))$/.exec(r[1]);return null===i?!1:i[1]>"23"||i[2]>"59"||i[3]>"59"?!1:!0},email:function(t){return"string"!=typeof t?!0:validator.isEmail(t,{require_tld:!0})},hostname:function(t){if("string"!=typeof t)return!0;var r=/^[a-zA-Z](([-0-9a-zA-Z]+)?[0-9a-zA-Z])?(\.[a-zA-Z](([-0-9a-zA-Z]+)?[0-9a-zA-Z])?)*$/.test(t);if(r){if(t.length>255)return!1;for(var i=t.split("."),e=0;e<i.length;e++)if(i[e].length>63)return!1}return r},"host-name":function(t){return FormatValidators.hostname.call(this,t)},ipv4:function(t){return"string"!=typeof t?!0:validator.isIP(t,4)},ipv6:function(t){return"string"!=typeof t?!0:validator.isIP(t,6)},regex:function(t){try{return RegExp(t),!0}catch(r){return!1}},uri:function(t){return this.options.strictUris?FormatValidators["strict-uri"].apply(this,arguments):"string"!=typeof t||RegExp("^(([^:/?#]+):)?(//([^/?#]*))?([^?#]*)(\\?([^#]*))?(#(.*))?").test(t)},"strict-uri":function(t){return"string"!=typeof t||validator.isURL(t)}};module.exports=FormatValidators;


},{"validator":137}],140:[function(require,module,exports){
"use strict";var FormatValidators=require("./FormatValidators"),Report=require("./Report"),Utils=require("./Utils"),JsonValidators={multipleOf:function(r,e,t){"number"==typeof t&&"integer"!==Utils.whatIs(t/e.multipleOf)&&r.addError("MULTIPLE_OF",[t,e.multipleOf],null,e.description)},maximum:function(r,e,t){"number"==typeof t&&(e.exclusiveMaximum!==!0?t>e.maximum&&r.addError("MAXIMUM",[t,e.maximum],null,e.description):t>=e.maximum&&r.addError("MAXIMUM_EXCLUSIVE",[t,e.maximum],null,e.description))},exclusiveMaximum:function(){},minimum:function(r,e,t){"number"==typeof t&&(e.exclusiveMinimum!==!0?t<e.minimum&&r.addError("MINIMUM",[t,e.minimum],null,e.description):t<=e.minimum&&r.addError("MINIMUM_EXCLUSIVE",[t,e.minimum],null,e.description))},exclusiveMinimum:function(){},maxLength:function(r,e,t){"string"==typeof t&&Utils.ucs2decode(t).length>e.maxLength&&r.addError("MAX_LENGTH",[t.length,e.maxLength],null,e.description)},minLength:function(r,e,t){"string"==typeof t&&Utils.ucs2decode(t).length<e.minLength&&r.addError("MIN_LENGTH",[t.length,e.minLength],null,e.description)},pattern:function(r,e,t){"string"==typeof t&&RegExp(e.pattern).test(t)===!1&&r.addError("PATTERN",[e.pattern,t],null,e.description)},additionalItems:function(r,e,t){Array.isArray(t)&&e.additionalItems===!1&&Array.isArray(e.items)&&t.length>e.items.length&&r.addError("ARRAY_ADDITIONAL_ITEMS",null,null,e.description)},items:function(){},maxItems:function(r,e,t){Array.isArray(t)&&t.length>e.maxItems&&r.addError("ARRAY_LENGTH_LONG",[t.length,e.maxItems],null,e.description)},minItems:function(r,e,t){Array.isArray(t)&&t.length<e.minItems&&r.addError("ARRAY_LENGTH_SHORT",[t.length,e.minItems],null,e.description)},uniqueItems:function(r,e,t){if(Array.isArray(t)&&e.uniqueItems===!0){var i=[];Utils.isUniqueArray(t,i)===!1&&r.addError("ARRAY_UNIQUE",i,null,e.description)}},maxProperties:function(r,e,t){if("object"===Utils.whatIs(t)){var i=Object.keys(t).length;i>e.maxProperties&&r.addError("OBJECT_PROPERTIES_MAXIMUM",[i,e.maxProperties],null,e.description)}},minProperties:function(r,e,t){if("object"===Utils.whatIs(t)){var i=Object.keys(t).length;i<e.minProperties&&r.addError("OBJECT_PROPERTIES_MINIMUM",[i,e.minProperties],null,e.description)}},required:function(r,e,t){if("object"===Utils.whatIs(t))for(var i=e.required.length;i--;){var n=e.required[i];void 0===t[n]&&r.addError("OBJECT_MISSING_REQUIRED_PROPERTY",[n],null,e.description)}},additionalProperties:function(r,e,t){return void 0===e.properties&&void 0===e.patternProperties?JsonValidators.properties.call(this,r,e,t):void 0},patternProperties:function(r,e,t){return void 0===e.properties?JsonValidators.properties.call(this,r,e,t):void 0},properties:function(r,e,t){if("object"===Utils.whatIs(t)){var i=void 0!==e.properties?e.properties:{},n=void 0!==e.patternProperties?e.patternProperties:{};if(e.additionalProperties===!1){var o=Object.keys(t),a=Object.keys(i),s=Object.keys(n);o=Utils.difference(o,a);for(var l=s.length;l--;)for(var d=RegExp(s[l]),p=o.length;p--;)d.test(o[p])===!0&&o.splice(p,1);o.length>0&&r.addError("OBJECT_ADDITIONAL_PROPERTIES",[o],null,e.description)}}},dependencies:function(r,e,t){if("object"===Utils.whatIs(t))for(var i=Object.keys(e.dependencies),n=i.length;n--;){var o=i[n];if(t[o]){var a=e.dependencies[o];if("object"===Utils.whatIs(a))exports.validate.call(this,r,a,t);else for(var s=a.length;s--;){var l=a[s];void 0===t[l]&&r.addError("OBJECT_DEPENDENCY_KEY",[l,o],null,e.description)}}}},"enum":function(r,e,t){for(var i=!1,n=e["enum"].length;n--;)if(Utils.areEqual(t,e["enum"][n])){i=!0;break}i===!1&&r.addError("ENUM_MISMATCH",[t],null,e.description)},allOf:function(r,e,t){for(var i=e.allOf.length;i--&&exports.validate.call(this,r,e.allOf[i],t)!==!1;);},anyOf:function(r,e,t){for(var i=[],n=!1,o=e.anyOf.length;o--&&n===!1;){var a=new Report(r);i.push(a),n=exports.validate.call(this,a,e.anyOf[o],t)}n===!1&&r.addError("ANY_OF_MISSING",void 0,i,e.description)},oneOf:function(r,e,t){for(var i=0,n=[],o=e.oneOf.length;o--;){var a=new Report(r,{maxErrors:1});n.push(a),exports.validate.call(this,a,e.oneOf[o],t)===!0&&i++}0===i?r.addError("ONE_OF_MISSING",void 0,n,e.description):i>1&&r.addError("ONE_OF_MULTIPLE",null,null,e.description)},not:function(r,e,t){var i=new Report(r);exports.validate.call(this,i,e.not,t)===!0&&r.addError("NOT_PASSED",null,null,e.description)},definitions:function(){},format:function(r,e,t){var i=FormatValidators[e.format];"function"==typeof i?2===i.length?r.addAsyncTask(i,[t],function(i){i!==!0&&r.addError("INVALID_FORMAT",[e.format,t],null,e.description)}):i.call(this,t)!==!0&&r.addError("INVALID_FORMAT",[e.format,t],null,e.description):r.addError("UNKNOWN_FORMAT",[e.format],null,e.description)}},recurseArray=function(r,e,t){var i=t.length;if(Array.isArray(e.items))for(;i--;)i<e.items.length?(r.path.push(i.toString()),exports.validate.call(this,r,e.items[i],t[i]),r.path.pop()):"object"==typeof e.additionalItems&&(r.path.push(i.toString()),exports.validate.call(this,r,e.additionalItems,t[i]),r.path.pop());else if("object"==typeof e.items)for(;i--;)r.path.push(i.toString()),exports.validate.call(this,r,e.items,t[i]),r.path.pop()},recurseObject=function(r,e,t){var i=e.additionalProperties;(i===!0||void 0===i)&&(i={});for(var n=e.properties?Object.keys(e.properties):[],o=e.patternProperties?Object.keys(e.patternProperties):[],a=Object.keys(t),s=a.length;s--;){var l=a[s],d=t[l],p=[];-1!==n.indexOf(l)&&p.push(e.properties[l]);for(var u=o.length;u--;){var c=o[u];RegExp(c).test(l)===!0&&p.push(e.patternProperties[c])}for(0===p.length&&i!==!1&&p.push(i),u=p.length;u--;)r.path.push(l),exports.validate.call(this,r,p[u],d),r.path.pop()}};exports.validate=function(r,e,t){r.commonErrorMessage="JSON_OBJECT_VALIDATION_FAILED";var i=Utils.whatIs(e);if("object"!==i)return r.addError("SCHEMA_NOT_AN_OBJECT",[i],null,e.description),!1;var n=Object.keys(e);if(0===n.length)return!0;var o=!1;if(r.rootSchema||(r.rootSchema=e,o=!0),void 0!==e.$ref){for(var a=99;e.$ref&&a>0;){if(!e.__$refResolved){r.addError("REF_UNRESOLVED",[e.$ref],null,e.description);break}if(e.__$refResolved===e)break;e=e.__$refResolved,n=Object.keys(e),a--}if(0===a)throw new Error("Circular dependency by $ref references!")}var s=Utils.whatIs(t);if(e.type)if("string"==typeof e.type){if(s!==e.type&&("integer"!==s||"number"!==e.type)&&(r.addError("INVALID_TYPE",[e.type,s],null,e.description),this.options.breakOnFirstError))return!1}else if(-1===e.type.indexOf(s)&&("integer"!==s||-1===e.type.indexOf("number"))&&(r.addError("INVALID_TYPE",[e.type,s],null,e.description),this.options.breakOnFirstError))return!1;for(var l=n.length;l--&&!(JsonValidators[n[l]]&&(JsonValidators[n[l]].call(this,r,e,t),r.errors.length&&this.options.breakOnFirstError)););return(0===r.errors.length||this.options.breakOnFirstError===!1)&&("array"===s?recurseArray.call(this,r,e,t):"object"===s&&recurseObject.call(this,r,e,t)),o&&(r.rootSchema=void 0),0===r.errors.length};


},{"./FormatValidators":139,"./Report":142,"./Utils":146}],141:[function(require,module,exports){
"function"!=typeof Number.isFinite&&(Number.isFinite=function(e){return"number"!=typeof e?!1:e!==e||e===1/0||e===-(1/0)?!1:!0});


},{}],142:[function(require,module,exports){
(function (process){
"use strict";function Report(r,t){this.parentReport=r instanceof Report?r:void 0,this.options=r instanceof Report?r.options:r||{},this.reportOptions=t||{},this.errors=[],this.path=[],this.asyncTasks=[]}var Errors=require("./Errors"),Utils=require("./Utils");Report.prototype.isValid=function(){if(this.asyncTasks.length>0)throw new Error("Async tasks pending, can't answer isValid");return 0===this.errors.length},Report.prototype.addAsyncTask=function(r,t,o){this.asyncTasks.push([r,t,o])},Report.prototype.processAsyncTasks=function(r,t){function o(){process.nextTick(function(){var r=0===p.errors.length,o=r?void 0:p.errors;t(o,r)})}function s(r){return function(t){a||(r(t),0===--n&&o())}}var e=r||2e3,n=this.asyncTasks.length,i=n,a=!1,p=this;if(0===n||this.errors.length>0)return void o();for(;i--;){var h=this.asyncTasks[i];h[0].apply(null,h[1].concat(s(h[2])))}setTimeout(function(){n>0&&(a=!0,p.addError("ASYNC_TIMEOUT",[n,e]),t(p.errors,!1))},e)},Report.prototype.getPath=function(){var r=[];return this.parentReport&&(r=r.concat(this.parentReport.path)),r=r.concat(this.path),this.options.reportPathAsArray!==!0&&(r="#/"+r.map(function(r){return Utils.isAbsoluteUri(r)?"uri("+r+")":r.replace("~","~0").replace("/","~1")}).join("/")),r},Report.prototype.addError=function(r,t,o,s){if(!(this.errors.length>=this.reportOptions.maxErrors)){if(!r)throw new Error("No errorCode passed into addError()");if(!Errors[r])throw new Error("No errorMessage known for code "+r);t=t||[];for(var e=t.length,n=Errors[r];e--;){var i=Utils.whatIs(t[e]),a="object"===i||"null"===i?JSON.stringify(t[e]):t[e];n=n.replace("{"+e+"}",a)}var p={code:r,params:t,message:n,path:this.getPath()};if(s&&(p.description=s),null!=o){for(Array.isArray(o)||(o=[o]),p.inner=[],e=o.length;e--;)for(var h=o[e],c=h.errors.length;c--;)p.inner.push(h.errors[c]);0===p.inner.length&&(p.inner=void 0)}this.errors.push(p)}},module.exports=Report;


}).call(this,require('_process'))
},{"./Errors":138,"./Utils":146,"_process":5}],143:[function(require,module,exports){
"use strict";function decodeJSONPointer(e){return decodeURIComponent(e).replace(/~[0-1]/g,function(e){return"~1"===e?"/":"~"})}function getRemotePath(e){var t=e.indexOf("#");return-1===t?e:e.slice(0,t)}function getQueryPath(e){var t=e.indexOf("#"),r=-1===t?void 0:e.slice(t+1);return r}function findId(e,t){if("object"==typeof e&&null!==e){if(!t)return e;if(e.id&&(e.id===t||"#"===e.id[0]&&e.id.substring(1)===t))return e;var r,i;if(Array.isArray(e)){for(r=e.length;r--;)if(i=findId(e[r],t))return i}else{var a=Object.keys(e);for(r=a.length;r--;){var n=a[r];if(0!==n.indexOf("__$")&&(i=findId(e[n],t)))return i}}}}var Report=require("./Report"),SchemaCompilation=require("./SchemaCompilation"),SchemaValidation=require("./SchemaValidation"),Utils=require("./Utils");exports.cacheSchemaByUri=function(e,t){var r=getRemotePath(e);r&&(this.cache[r]=t)},exports.removeFromCacheByUri=function(e){var t=getRemotePath(e);t&&(this.cache[t]=void 0)},exports.checkCacheForUri=function(e){var t=getRemotePath(e);return t?null!=this.cache[t]:!1},exports.getSchema=function(e,t){return"object"==typeof t&&(t=exports.getSchemaByReference.call(this,e,t)),"string"==typeof t&&(t=exports.getSchemaByUri.call(this,e,t)),t},exports.getSchemaByReference=function(e,t){for(var r=this.referenceCache.length;r--;)if(this.referenceCache[r][0]===t)return this.referenceCache[r][1];var i=Utils.cloneDeep(t);return this.referenceCache.push([t,i]),i},exports.getSchemaByUri=function(e,t,r){var i=getRemotePath(t),a=getQueryPath(t),n=i?this.cache[i]:r;if(n&&i){var c=n!==r;if(c){e.path.push(i);var o=new Report(e);SchemaCompilation.compileSchema.call(this,o,n)&&SchemaValidation.validateSchema.call(this,o,n);var h=o.isValid();if(h||e.addError("REMOTE_NOT_VALID",[t],o),e.path.pop(),!h)return void 0}}if(n&&a)for(var f=a.split("/"),s=0,u=f.length;u>s;s++){var l=decodeJSONPointer(f[s]);n=0===s?findId(n,l):n[l]}return n},exports.getRemotePath=getRemotePath;


},{"./Report":142,"./SchemaCompilation":144,"./SchemaValidation":145,"./Utils":146}],144:[function(require,module,exports){
"use strict";function mergeReference(e,r){if(Utils.isAbsoluteUri(r))return r;var i,s=e.join(""),c=Utils.isAbsoluteUri(s),t=Utils.isRelativeUri(s),a=Utils.isRelativeUri(r);c&&a?(i=s.match(/\/[^\/]*$/),i&&(s=s.slice(0,i.index+1))):t&&a?s="":(i=s.match(/[^#/]+$/),i&&(s=s.slice(0,i.index)));var l=s+r;return l=l.replace(/##/,"#")}function collectReferences(e,r,i,s){if(r=r||[],i=i||[],s=s||[],"object"!=typeof e||null===e)return r;"string"==typeof e.id&&i.push(e.id),"string"==typeof e.$ref&&"undefined"==typeof e.__$refResolved&&r.push({ref:mergeReference(i,e.$ref),key:"$ref",obj:e,path:s.slice(0)}),"string"==typeof e.$schema&&"undefined"==typeof e.__$schemaResolved&&r.push({ref:mergeReference(i,e.$schema),key:"$schema",obj:e,path:s.slice(0)});var c;if(Array.isArray(e))for(c=e.length;c--;)s.push(c.toString()),collectReferences(e[c],r,i,s),s.pop();else{var t=Object.keys(e);for(c=t.length;c--;)0!==t[c].indexOf("__$")&&(s.push(t[c]),collectReferences(e[t[c]],r,i,s),s.pop())}return"string"==typeof e.id&&i.pop(),r}function findId(e,r){for(var i=e.length;i--;)if(e[i].id===r)return e[i];return null}var Report=require("./Report"),SchemaCache=require("./SchemaCache"),Utils=require("./Utils"),compileArrayOfSchemasLoop=function(e,r){for(var i=r.length,s=0;i--;){var c=new Report(e),t=exports.compileSchema.call(this,c,r[i]);t&&s++,e.errors=e.errors.concat(c.errors)}return s},compileArrayOfSchemas=function(e,r){var i,s=0;do{for(var c=e.errors.length;c--;)"UNRESOLVABLE_REFERENCE"===e.errors[c].code&&e.errors.splice(c,1);for(i=s,s=compileArrayOfSchemasLoop.call(this,e,r),c=r.length;c--;){var t=r[c];if(t.__$missingReferences){for(var a=t.__$missingReferences.length;a--;){var l=t.__$missingReferences[a],n=findId(r,l.ref);n&&(l.obj["__"+l.key+"Resolved"]=n,t.__$missingReferences.splice(a,1))}0===t.__$missingReferences.length&&delete t.__$missingReferences}}}while(s!==r.length&&s!==i);return e.isValid()};exports.compileSchema=function(e,r){if(e.commonErrorMessage="SCHEMA_COMPILATION_FAILED","string"==typeof r){var i=SchemaCache.getSchemaByUri.call(this,e,r);if(!i)return e.addError("SCHEMA_NOT_REACHABLE",[r]),!1;r=i}if(Array.isArray(r))return compileArrayOfSchemas.call(this,e,r);if(r.__$compiled&&r.id&&SchemaCache.checkCacheForUri.call(this,r.id)===!1&&(r.__$compiled=void 0),r.__$compiled)return!0;r.id&&SchemaCache.cacheSchemaByUri.call(this,r.id,r);var s=e.isValid();delete r.__$missingReferences;for(var c=collectReferences.call(this,r),t=c.length;t--;){var a=c[t],l=SchemaCache.getSchemaByUri.call(this,e,a.ref,r);if(!l){var n=Utils.isAbsoluteUri(a.ref),o=!1,h=this.options.ignoreUnresolvableReferences===!0;n&&(o=SchemaCache.checkCacheForUri.call(this,a.ref)),n&&(o||h)||(Array.prototype.push.apply(e.path,a.path),e.addError("UNRESOLVABLE_REFERENCE",[a.ref]),e.path.slice(0,-a.path.length),s&&(r.__$missingReferences=r.__$missingReferences||[],r.__$missingReferences.push(a)))}a.obj["__"+a.key+"Resolved"]=l}var f=e.isValid();return f?r.__$compiled=!0:r.id&&SchemaCache.removeFromCacheByUri.call(this,r.id),f};


},{"./Report":142,"./SchemaCache":143,"./Utils":146}],145:[function(require,module,exports){
"use strict";var FormatValidators=require("./FormatValidators"),JsonValidation=require("./JsonValidation"),Report=require("./Report"),Utils=require("./Utils"),SchemaValidators={$ref:function(r,e){"string"!=typeof e.$ref&&r.addError("KEYWORD_TYPE_EXPECTED",["$ref","string"])},$schema:function(r,e){"string"!=typeof e.$schema&&r.addError("KEYWORD_TYPE_EXPECTED",["$schema","string"])},multipleOf:function(r,e){"number"!=typeof e.multipleOf?r.addError("KEYWORD_TYPE_EXPECTED",["multipleOf","number"]):e.multipleOf<=0&&r.addError("KEYWORD_MUST_BE",["multipleOf","strictly greater than 0"])},maximum:function(r,e){"number"!=typeof e.maximum&&r.addError("KEYWORD_TYPE_EXPECTED",["maximum","number"])},exclusiveMaximum:function(r,e){"boolean"!=typeof e.exclusiveMaximum?r.addError("KEYWORD_TYPE_EXPECTED",["exclusiveMaximum","boolean"]):void 0===e.maximum&&r.addError("KEYWORD_DEPENDENCY",["exclusiveMaximum","maximum"])},minimum:function(r,e){"number"!=typeof e.minimum&&r.addError("KEYWORD_TYPE_EXPECTED",["minimum","number"])},exclusiveMinimum:function(r,e){"boolean"!=typeof e.exclusiveMinimum?r.addError("KEYWORD_TYPE_EXPECTED",["exclusiveMinimum","boolean"]):void 0===e.minimum&&r.addError("KEYWORD_DEPENDENCY",["exclusiveMinimum","minimum"])},maxLength:function(r,e){"integer"!==Utils.whatIs(e.maxLength)?r.addError("KEYWORD_TYPE_EXPECTED",["maxLength","integer"]):e.maxLength<0&&r.addError("KEYWORD_MUST_BE",["maxLength","greater than, or equal to 0"])},minLength:function(r,e){"integer"!==Utils.whatIs(e.minLength)?r.addError("KEYWORD_TYPE_EXPECTED",["minLength","integer"]):e.minLength<0&&r.addError("KEYWORD_MUST_BE",["minLength","greater than, or equal to 0"])},pattern:function(r,e){if("string"!=typeof e.pattern)r.addError("KEYWORD_TYPE_EXPECTED",["pattern","string"]);else try{RegExp(e.pattern)}catch(t){r.addError("KEYWORD_PATTERN",["pattern",e.pattern])}},additionalItems:function(r,e){var t=Utils.whatIs(e.additionalItems);"boolean"!==t&&"object"!==t?r.addError("KEYWORD_TYPE_EXPECTED",["additionalItems",["boolean","object"]]):"object"===t&&(r.path.push("additionalItems"),exports.validateSchema.call(this,r,e.additionalItems),r.path.pop())},items:function(r,e){var t=Utils.whatIs(e.items);if("object"===t)r.path.push("items"),exports.validateSchema.call(this,r,e.items),r.path.pop();else if("array"===t)for(var a=e.items.length;a--;)r.path.push("items"),r.path.push(a.toString()),exports.validateSchema.call(this,r,e.items[a]),r.path.pop(),r.path.pop();else r.addError("KEYWORD_TYPE_EXPECTED",["items",["array","object"]]);this.options.forceAdditional===!0&&void 0===e.additionalItems&&Array.isArray(e.items)&&r.addError("KEYWORD_UNDEFINED_STRICT",["additionalItems"]),this.options.assumeAdditional===!0&&void 0===e.additionalItems&&Array.isArray(e.items)&&(e.additionalItems=!1)},maxItems:function(r,e){"number"!=typeof e.maxItems?r.addError("KEYWORD_TYPE_EXPECTED",["maxItems","integer"]):e.maxItems<0&&r.addError("KEYWORD_MUST_BE",["maxItems","greater than, or equal to 0"])},minItems:function(r,e){"integer"!==Utils.whatIs(e.minItems)?r.addError("KEYWORD_TYPE_EXPECTED",["minItems","integer"]):e.minItems<0&&r.addError("KEYWORD_MUST_BE",["minItems","greater than, or equal to 0"])},uniqueItems:function(r,e){"boolean"!=typeof e.uniqueItems&&r.addError("KEYWORD_TYPE_EXPECTED",["uniqueItems","boolean"])},maxProperties:function(r,e){"integer"!==Utils.whatIs(e.maxProperties)?r.addError("KEYWORD_TYPE_EXPECTED",["maxProperties","integer"]):e.maxProperties<0&&r.addError("KEYWORD_MUST_BE",["maxProperties","greater than, or equal to 0"])},minProperties:function(r,e){"integer"!==Utils.whatIs(e.minProperties)?r.addError("KEYWORD_TYPE_EXPECTED",["minProperties","integer"]):e.minProperties<0&&r.addError("KEYWORD_MUST_BE",["minProperties","greater than, or equal to 0"])},required:function(r,e){if("array"!==Utils.whatIs(e.required))r.addError("KEYWORD_TYPE_EXPECTED",["required","array"]);else if(0===e.required.length)r.addError("KEYWORD_MUST_BE",["required","an array with at least one element"]);else{for(var t=e.required.length;t--;)"string"!=typeof e.required[t]&&r.addError("KEYWORD_VALUE_TYPE",["required","string"]);Utils.isUniqueArray(e.required)===!1&&r.addError("KEYWORD_MUST_BE",["required","an array with unique items"])}},additionalProperties:function(r,e){var t=Utils.whatIs(e.additionalProperties);"boolean"!==t&&"object"!==t?r.addError("KEYWORD_TYPE_EXPECTED",["additionalProperties",["boolean","object"]]):"object"===t&&(r.path.push("additionalProperties"),exports.validateSchema.call(this,r,e.additionalProperties),r.path.pop())},properties:function(r,e){if("object"!==Utils.whatIs(e.properties))return void r.addError("KEYWORD_TYPE_EXPECTED",["properties","object"]);for(var t=Object.keys(e.properties),a=t.length;a--;){var i=t[a],o=e.properties[i];r.path.push("properties"),r.path.push(i),exports.validateSchema.call(this,r,o),r.path.pop(),r.path.pop()}this.options.forceAdditional===!0&&void 0===e.additionalProperties&&r.addError("KEYWORD_UNDEFINED_STRICT",["additionalProperties"]),this.options.assumeAdditional===!0&&void 0===e.additionalProperties&&(e.additionalProperties=!1),this.options.forceProperties===!0&&0===t.length&&r.addError("CUSTOM_MODE_FORCE_PROPERTIES",["properties"])},patternProperties:function(r,e){if("object"!==Utils.whatIs(e.patternProperties))return void r.addError("KEYWORD_TYPE_EXPECTED",["patternProperties","object"]);for(var t=Object.keys(e.patternProperties),a=t.length;a--;){var i=t[a],o=e.patternProperties[i];try{RegExp(i)}catch(n){r.addError("KEYWORD_PATTERN",["patternProperties",i])}r.path.push("patternProperties"),r.path.push(i.toString()),exports.validateSchema.call(this,r,o),r.path.pop(),r.path.pop()}this.options.forceProperties===!0&&0===t.length&&r.addError("CUSTOM_MODE_FORCE_PROPERTIES",["patternProperties"])},dependencies:function(r,e){if("object"!==Utils.whatIs(e.dependencies))r.addError("KEYWORD_TYPE_EXPECTED",["dependencies","object"]);else for(var t=Object.keys(e.dependencies),a=t.length;a--;){var i=t[a],o=e.dependencies[i],n=Utils.whatIs(o);if("object"===n)r.path.push("dependencies"),r.path.push(i),exports.validateSchema.call(this,r,o),r.path.pop(),r.path.pop();else if("array"===n){var E=o.length;for(0===E&&r.addError("KEYWORD_MUST_BE",["dependencies","not empty array"]);E--;)"string"!=typeof o[E]&&r.addError("KEYWORD_VALUE_TYPE",["dependensices","string"]);Utils.isUniqueArray(o)===!1&&r.addError("KEYWORD_MUST_BE",["dependencies","an array with unique items"])}else r.addError("KEYWORD_VALUE_TYPE",["dependencies","object or array"])}},"enum":function(r,e){Array.isArray(e["enum"])===!1?r.addError("KEYWORD_TYPE_EXPECTED",["enum","array"]):0===e["enum"].length?r.addError("KEYWORD_MUST_BE",["enum","an array with at least one element"]):Utils.isUniqueArray(e["enum"])===!1&&r.addError("KEYWORD_MUST_BE",["enum","an array with unique elements"])},type:function(r,e){var t=["array","boolean","integer","number","null","object","string"],a=t.join(","),i=Array.isArray(e.type);if(i){for(var o=e.type.length;o--;)-1===t.indexOf(e.type[o])&&r.addError("KEYWORD_TYPE_EXPECTED",["type",a]);Utils.isUniqueArray(e.type)===!1&&r.addError("KEYWORD_MUST_BE",["type","an object with unique properties"])}else"string"==typeof e.type?-1===t.indexOf(e.type)&&r.addError("KEYWORD_TYPE_EXPECTED",["type",a]):r.addError("KEYWORD_TYPE_EXPECTED",["type",["string","array"]]);this.options.noEmptyStrings===!0&&("string"===e.type||i&&-1!==e.type.indexOf("string"))&&void 0===e.minLength&&void 0===e["enum"]&&void 0===e.format&&(e.minLength=1),this.options.noEmptyArrays===!0&&("array"===e.type||i&&-1!==e.type.indexOf("array"))&&void 0===e.minItems&&(e.minItems=1),this.options.forceProperties===!0&&("object"===e.type||i&&-1!==e.type.indexOf("object"))&&void 0===e.properties&&void 0===e.patternProperties&&r.addError("KEYWORD_UNDEFINED_STRICT",["properties"]),this.options.forceItems===!0&&("array"===e.type||i&&-1!==e.type.indexOf("array"))&&void 0===e.items&&r.addError("KEYWORD_UNDEFINED_STRICT",["items"]),this.options.forceMinItems===!0&&("array"===e.type||i&&-1!==e.type.indexOf("array"))&&void 0===e.minItems&&r.addError("KEYWORD_UNDEFINED_STRICT",["minItems"]),this.options.forceMaxItems===!0&&("array"===e.type||i&&-1!==e.type.indexOf("array"))&&void 0===e.maxItems&&r.addError("KEYWORD_UNDEFINED_STRICT",["maxItems"]),this.options.forceMinLength===!0&&("string"===e.type||i&&-1!==e.type.indexOf("string"))&&void 0===e.minLength&&void 0===e.format&&void 0===e["enum"]&&void 0===e.pattern&&r.addError("KEYWORD_UNDEFINED_STRICT",["minLength"]),this.options.forceMaxLength===!0&&("string"===e.type||i&&-1!==e.type.indexOf("string"))&&void 0===e.maxLength&&void 0===e.format&&void 0===e["enum"]&&void 0===e.pattern&&r.addError("KEYWORD_UNDEFINED_STRICT",["maxLength"])},allOf:function(r,e){if(Array.isArray(e.allOf)===!1)r.addError("KEYWORD_TYPE_EXPECTED",["allOf","array"]);else if(0===e.allOf.length)r.addError("KEYWORD_MUST_BE",["allOf","an array with at least one element"]);else for(var t=e.allOf.length;t--;)r.path.push("allOf"),r.path.push(t.toString()),exports.validateSchema.call(this,r,e.allOf[t]),r.path.pop(),r.path.pop()},anyOf:function(r,e){if(Array.isArray(e.anyOf)===!1)r.addError("KEYWORD_TYPE_EXPECTED",["anyOf","array"]);else if(0===e.anyOf.length)r.addError("KEYWORD_MUST_BE",["anyOf","an array with at least one element"]);else for(var t=e.anyOf.length;t--;)r.path.push("anyOf"),r.path.push(t.toString()),exports.validateSchema.call(this,r,e.anyOf[t]),r.path.pop(),r.path.pop()},oneOf:function(r,e){if(Array.isArray(e.oneOf)===!1)r.addError("KEYWORD_TYPE_EXPECTED",["oneOf","array"]);else if(0===e.oneOf.length)r.addError("KEYWORD_MUST_BE",["oneOf","an array with at least one element"]);else for(var t=e.oneOf.length;t--;)r.path.push("oneOf"),r.path.push(t.toString()),exports.validateSchema.call(this,r,e.oneOf[t]),r.path.pop(),r.path.pop()},not:function(r,e){"object"!==Utils.whatIs(e.not)?r.addError("KEYWORD_TYPE_EXPECTED",["not","object"]):(r.path.push("not"),exports.validateSchema.call(this,r,e.not),r.path.pop())},definitions:function(r,e){if("object"!==Utils.whatIs(e.definitions))r.addError("KEYWORD_TYPE_EXPECTED",["definitions","object"]);else for(var t=Object.keys(e.definitions),a=t.length;a--;){var i=t[a],o=e.definitions[i];r.path.push("definitions"),r.path.push(i),exports.validateSchema.call(this,r,o),r.path.pop(),r.path.pop()}},format:function(r,e){"string"!=typeof e.format?r.addError("KEYWORD_TYPE_EXPECTED",["format","string"]):void 0===FormatValidators[e.format]&&r.addError("UNKNOWN_FORMAT",[e.format])},id:function(r,e){"string"!=typeof e.id&&r.addError("KEYWORD_TYPE_EXPECTED",["id","string"])},title:function(r,e){"string"!=typeof e.title&&r.addError("KEYWORD_TYPE_EXPECTED",["title","string"])},description:function(r,e){"string"!=typeof e.description&&r.addError("KEYWORD_TYPE_EXPECTED",["description","string"])},"default":function(){}},validateArrayOfSchemas=function(r,e){for(var t=e.length;t--;)exports.validateSchema.call(this,r,e[t]);return r.isValid()};exports.validateSchema=function(r,e){if(r.commonErrorMessage="SCHEMA_VALIDATION_FAILED",Array.isArray(e))return validateArrayOfSchemas.call(this,r,e);if(e.__$validated)return!0;var t=e.$schema&&e.id!==e.$schema;if(t)if(e.__$schemaResolved&&e.__$schemaResolved!==e){var a=new Report(r),i=JsonValidation.validate.call(this,a,e.__$schemaResolved,e);i===!1&&r.addError("PARENT_SCHEMA_VALIDATION_FAILED",null,a)}else this.options.ignoreUnresolvableReferences!==!0&&r.addError("REF_UNRESOLVED",[e.$schema]);if(this.options.noTypeless===!0){if(void 0!==e.type){var o=[];Array.isArray(e.anyOf)&&(o=o.concat(e.anyOf)),Array.isArray(e.oneOf)&&(o=o.concat(e.oneOf)),Array.isArray(e.allOf)&&(o=o.concat(e.allOf)),o.forEach(function(r){r.type||(r.type=e.type)})}void 0===e["enum"]&&void 0===e.type&&void 0===e.anyOf&&void 0===e.oneOf&&void 0===e.not&&void 0===e.$ref&&r.addError("KEYWORD_UNDEFINED_STRICT",["type"])}for(var n=Object.keys(e),E=n.length;E--;){var s=n[E];0!==s.indexOf("__")&&(void 0!==SchemaValidators[s]?SchemaValidators[s].call(this,r,e):t||this.options.noExtraKeywords===!0&&r.addError("KEYWORD_UNEXPECTED",[s]))}var d=r.isValid();return d&&(e.__$validated=!0),d};


},{"./FormatValidators":139,"./JsonValidation":140,"./Report":142,"./Utils":146}],146:[function(require,module,exports){
"use strict";exports.isAbsoluteUri=function(r){return/^https?:\/\//.test(r)},exports.isRelativeUri=function(r){return/.+#/.test(r)},exports.whatIs=function(r){var e=typeof r;return"object"===e?null===r?"null":Array.isArray(r)?"array":"object":"number"===e?Number.isFinite(r)?r%1===0?"integer":"number":Number.isNaN(r)?"not-a-number":"unknown-number":e},exports.areEqual=function r(e,t){if(e===t)return!0;var n,u;if(Array.isArray(e)&&Array.isArray(t)){if(e.length!==t.length)return!1;for(u=e.length,n=0;u>n;n++)if(!r(e[n],t[n]))return!1;return!0}if("object"===exports.whatIs(e)&&"object"===exports.whatIs(t)){var o=Object.keys(e),s=Object.keys(t);if(!r(o,s))return!1;for(u=o.length,n=0;u>n;n++)if(!r(e[o[n]],t[o[n]]))return!1;return!0}return!1},exports.isUniqueArray=function(r,e){var t,n,u=r.length;for(t=0;u>t;t++)for(n=t+1;u>n;n++)if(exports.areEqual(r[t],r[n]))return e&&e.push(t,n),!1;return!0},exports.difference=function(r,e){for(var t=[],n=r.length;n--;)-1===e.indexOf(r[n])&&t.push(r[n]);return t},exports.clone=function(r){if("object"!=typeof r||null===r)return r;var e,t;if(Array.isArray(r))for(e=[],t=r.length;t--;)e[t]=r[t];else{e={};var n=Object.keys(r);for(t=n.length;t--;){var u=n[t];e[u]=r[u]}}return e},exports.cloneDeep=function e(r){if("object"!=typeof r||null===r)return r;var t,n;if(Array.isArray(r))for(t=[],n=r.length;n--;)t[n]=e(r[n]);else{t={};var u=Object.keys(r);for(n=u.length;n--;){var o=u[n];t[o]=e(r[o])}}return t},exports.ucs2decode=function(r){for(var e,t,n=[],u=0,o=r.length;o>u;)e=r.charCodeAt(u++),e>=55296&&56319>=e&&o>u?(t=r.charCodeAt(u++),56320==(64512&t)?n.push(((1023&e)<<10)+(1023&t)+65536):(n.push(e),u--)):n.push(e);return n};


},{}],147:[function(require,module,exports){
"use strict";function ZSchema(e){if(this.cache={},this.referenceCache=[],this.setRemoteReference("http://json-schema.org/draft-04/schema",Draft4Schema),this.setRemoteReference("http://json-schema.org/draft-04/hyper-schema",Draft4HyperSchema),"object"==typeof e){for(var t=Object.keys(e),r=t.length;r--;){var o=t[r];if(void 0===defaultOptions[o])throw new Error("Unexpected option passed to constructor: "+o)}this.options=e}else this.options=Utils.clone(defaultOptions);this.options.strictMode===!0&&(this.options.forceAdditional=!0,this.options.forceItems=!0,this.options.forceMaxLength=!0,this.options.forceProperties=!0,this.options.noExtraKeywords=!0,this.options.noTypeless=!0,this.options.noEmptyStrings=!0,this.options.noEmptyArrays=!0)}require("./Polyfills");var Report=require("./Report"),FormatValidators=require("./FormatValidators"),JsonValidation=require("./JsonValidation"),SchemaCache=require("./SchemaCache"),SchemaCompilation=require("./SchemaCompilation"),SchemaValidation=require("./SchemaValidation"),Utils=require("./Utils"),Draft4Schema=require("./schemas/schema.json"),Draft4HyperSchema=require("./schemas/hyper-schema.json"),defaultOptions={asyncTimeout:2e3,forceAdditional:!1,assumeAdditional:!1,forceItems:!1,forceMinItems:!1,forceMaxItems:!1,forceMinLength:!1,forceMaxLength:!1,forceProperties:!1,ignoreUnresolvableReferences:!1,noExtraKeywords:!1,noTypeless:!1,noEmptyStrings:!1,noEmptyArrays:!1,strictUris:!1,strictMode:!1,reportPathAsArray:!1,breakOnFirstError:!0};ZSchema.prototype.compileSchema=function(e){var t=new Report(this.options);return e=SchemaCache.getSchema.call(this,t,e),SchemaCompilation.compileSchema.call(this,t,e),this.lastReport=t,t.isValid()},ZSchema.prototype.validateSchema=function(e){var t=new Report(this.options);e=SchemaCache.getSchema.call(this,t,e);var r=SchemaCompilation.compileSchema.call(this,t,e);return r&&SchemaValidation.validateSchema.call(this,t,e),this.lastReport=t,t.isValid()},ZSchema.prototype.validate=function(e,t,r){var o=new Report(this.options);t=SchemaCache.getSchema.call(this,o,t);var a=SchemaCompilation.compileSchema.call(this,o,t);if(!a)return this.lastReport=o,!1;var s=SchemaValidation.validateSchema.call(this,o,t);if(!s)return this.lastReport=o,!1;if(JsonValidation.validate.call(this,o,t,e),r)return void o.processAsyncTasks(this.options.asyncTimeout,r);if(o.asyncTasks.length>0)throw new Error("This validation has async tasks and cannot be done in sync mode, please provide callback argument.");return this.lastReport=o,o.isValid()},ZSchema.prototype.getLastError=function(){if(0===this.lastReport.errors.length)return null;var e=new Error;return e.name="z-schema validation error",e.message=this.lastReport.commonErrorMessage,e.details=this.lastReport.errors,e},ZSchema.prototype.getLastErrors=function(){return this.lastReport.errors.length>0?this.lastReport.errors:void 0},ZSchema.prototype.getMissingReferences=function(){for(var e=[],t=this.lastReport.errors.length;t--;){var r=this.lastReport.errors[t];if("UNRESOLVABLE_REFERENCE"===r.code){var o=r.params[0];-1===e.indexOf(o)&&e.push(o)}}return e},ZSchema.prototype.getMissingRemoteReferences=function(){for(var e=this.getMissingReferences(),t=[],r=e.length;r--;){var o=SchemaCache.getRemotePath(e[r]);o&&-1===t.indexOf(o)&&t.push(o)}return t},ZSchema.prototype.setRemoteReference=function(e,t){"string"==typeof t&&(t=JSON.parse(t)),SchemaCache.cacheSchemaByUri.call(this,e,t)},ZSchema.prototype.getResolvedSchema=function(e){var t=new Report(this.options);e=SchemaCache.getSchema.call(this,t,e),e=Utils.cloneDeep(e);var r=function(e){var t,o=Utils.whatIs(e);if("object"===o||"array"===o){if(e.$ref&&e.__$refResolved){var a=e.__$refResolved,s=e;delete e.$ref,delete e.__$refResolved;for(t in a)a.hasOwnProperty(t)&&(s[t]=a[t])}for(t in e)if(e.hasOwnProperty(t)){if(0===t.indexOf("__$")){delete e[t];continue}r(e[t])}}};if(r(e),this.lastReport=t,t.isValid())return e;throw this.getLastError()},ZSchema.registerFormat=function(e,t){FormatValidators[e]=t},ZSchema.getDefaultOptions=function(){return Utils.cloneDeep(defaultOptions)},module.exports=ZSchema;


},{"./FormatValidators":139,"./JsonValidation":140,"./Polyfills":141,"./Report":142,"./SchemaCache":143,"./SchemaCompilation":144,"./SchemaValidation":145,"./Utils":146,"./schemas/hyper-schema.json":148,"./schemas/schema.json":149}],148:[function(require,module,exports){
module.exports={
    "$schema": "http://json-schema.org/draft-04/hyper-schema#",
    "id": "http://json-schema.org/draft-04/hyper-schema#",
    "title": "JSON Hyper-Schema",
    "allOf": [
        {
            "$ref": "http://json-schema.org/draft-04/schema#"
        }
    ],
    "properties": {
        "additionalItems": {
            "anyOf": [
                {
                    "type": "boolean"
                },
                {
                    "$ref": "#"
                }
            ]
        },
        "additionalProperties": {
            "anyOf": [
                {
                    "type": "boolean"
                },
                {
                    "$ref": "#"
                }
            ]
        },
        "dependencies": {
            "additionalProperties": {
                "anyOf": [
                    {
                        "$ref": "#"
                    },
                    {
                        "type": "array"
                    }
                ]
            }
        },
        "items": {
            "anyOf": [
                {
                    "$ref": "#"
                },
                {
                    "$ref": "#/definitions/schemaArray"
                }
            ]
        },
        "definitions": {
            "additionalProperties": {
                "$ref": "#"
            }
        },
        "patternProperties": {
            "additionalProperties": {
                "$ref": "#"
            }
        },
        "properties": {
            "additionalProperties": {
                "$ref": "#"
            }
        },
        "allOf": {
            "$ref": "#/definitions/schemaArray"
        },
        "anyOf": {
            "$ref": "#/definitions/schemaArray"
        },
        "oneOf": {
            "$ref": "#/definitions/schemaArray"
        },
        "not": {
            "$ref": "#"
        },

        "links": {
            "type": "array",
            "items": {
                "$ref": "#/definitions/linkDescription"
            }
        },
        "fragmentResolution": {
            "type": "string"
        },
        "media": {
            "type": "object",
            "properties": {
                "type": {
                    "description": "A media type, as described in RFC 2046",
                    "type": "string"
                },
                "binaryEncoding": {
                    "description": "A content encoding scheme, as described in RFC 2045",
                    "type": "string"
                }
            }
        },
        "pathStart": {
            "description": "Instances' URIs must start with this value for this schema to apply to them",
            "type": "string",
            "format": "uri"
        }
    },
    "definitions": {
        "schemaArray": {
            "type": "array",
            "items": {
                "$ref": "#"
            }
        },
        "linkDescription": {
            "title": "Link Description Object",
            "type": "object",
            "required": [ "href", "rel" ],
            "properties": {
                "href": {
                    "description": "a URI template, as defined by RFC 6570, with the addition of the $, ( and ) characters for pre-processing",
                    "type": "string"
                },
                "rel": {
                    "description": "relation to the target resource of the link",
                    "type": "string"
                },
                "title": {
                    "description": "a title for the link",
                    "type": "string"
                },
                "targetSchema": {
                    "description": "JSON Schema describing the link target",
                    "$ref": "#"
                },
                "mediaType": {
                    "description": "media type (as defined by RFC 2046) describing the link target",
                    "type": "string"
                },
                "method": {
                    "description": "method for requesting the target of the link (e.g. for HTTP this might be \"GET\" or \"DELETE\")",
                    "type": "string"
                },
                "encType": {
                    "description": "The media type in which to submit data along with the request",
                    "type": "string",
                    "default": "application/json"
                },
                "schema": {
                    "description": "Schema describing the data to submit along with the request",
                    "$ref": "#"
                }
            }
        }
    }
}


},{}],149:[function(require,module,exports){
module.exports={
    "id": "http://json-schema.org/draft-04/schema#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "description": "Core schema meta-schema",
    "definitions": {
        "schemaArray": {
            "type": "array",
            "minItems": 1,
            "items": { "$ref": "#" }
        },
        "positiveInteger": {
            "type": "integer",
            "minimum": 0
        },
        "positiveIntegerDefault0": {
            "allOf": [ { "$ref": "#/definitions/positiveInteger" }, { "default": 0 } ]
        },
        "simpleTypes": {
            "enum": [ "array", "boolean", "integer", "null", "number", "object", "string" ]
        },
        "stringArray": {
            "type": "array",
            "items": { "type": "string" },
            "minItems": 1,
            "uniqueItems": true
        }
    },
    "type": "object",
    "properties": {
        "id": {
            "type": "string",
            "format": "uri"
        },
        "$schema": {
            "type": "string",
            "format": "uri"
        },
        "title": {
            "type": "string"
        },
        "description": {
            "type": "string"
        },
        "default": {},
        "multipleOf": {
            "type": "number",
            "minimum": 0,
            "exclusiveMinimum": true
        },
        "maximum": {
            "type": "number"
        },
        "exclusiveMaximum": {
            "type": "boolean",
            "default": false
        },
        "minimum": {
            "type": "number"
        },
        "exclusiveMinimum": {
            "type": "boolean",
            "default": false
        },
        "maxLength": { "$ref": "#/definitions/positiveInteger" },
        "minLength": { "$ref": "#/definitions/positiveIntegerDefault0" },
        "pattern": {
            "type": "string",
            "format": "regex"
        },
        "additionalItems": {
            "anyOf": [
                { "type": "boolean" },
                { "$ref": "#" }
            ],
            "default": {}
        },
        "items": {
            "anyOf": [
                { "$ref": "#" },
                { "$ref": "#/definitions/schemaArray" }
            ],
            "default": {}
        },
        "maxItems": { "$ref": "#/definitions/positiveInteger" },
        "minItems": { "$ref": "#/definitions/positiveIntegerDefault0" },
        "uniqueItems": {
            "type": "boolean",
            "default": false
        },
        "maxProperties": { "$ref": "#/definitions/positiveInteger" },
        "minProperties": { "$ref": "#/definitions/positiveIntegerDefault0" },
        "required": { "$ref": "#/definitions/stringArray" },
        "additionalProperties": {
            "anyOf": [
                { "type": "boolean" },
                { "$ref": "#" }
            ],
            "default": {}
        },
        "definitions": {
            "type": "object",
            "additionalProperties": { "$ref": "#" },
            "default": {}
        },
        "properties": {
            "type": "object",
            "additionalProperties": { "$ref": "#" },
            "default": {}
        },
        "patternProperties": {
            "type": "object",
            "additionalProperties": { "$ref": "#" },
            "default": {}
        },
        "dependencies": {
            "type": "object",
            "additionalProperties": {
                "anyOf": [
                    { "$ref": "#" },
                    { "$ref": "#/definitions/stringArray" }
                ]
            }
        },
        "enum": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true
        },
        "type": {
            "anyOf": [
                { "$ref": "#/definitions/simpleTypes" },
                {
                    "type": "array",
                    "items": { "$ref": "#/definitions/simpleTypes" },
                    "minItems": 1,
                    "uniqueItems": true
                }
            ]
        },
        "allOf": { "$ref": "#/definitions/schemaArray" },
        "anyOf": { "$ref": "#/definitions/schemaArray" },
        "oneOf": { "$ref": "#/definitions/schemaArray" },
        "not": { "$ref": "#" }
    },
    "dependencies": {
        "exclusiveMaximum": [ "maximum" ],
        "exclusiveMinimum": [ "minimum" ]
    },
    "default": {}
}

},{}],150:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/apiDeclaration.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [ "swaggerVersion", "basePath", "apis" ],
    "properties": {
        "swaggerVersion": { "enum": [ "1.2" ] },
        "apiVersion": { "type": "string" },
        "basePath": {
            "type": "string",
            "format": "uri",
            "pattern": "^https?://"
        },
        "resourcePath": {
            "type": "string",
            "format": "uri",
            "pattern": "^/"
        },
        "apis": {
            "type": "array",
            "items": { "$ref": "#/definitions/apiObject" }
        },
        "models": {
            "type": "object",
            "additionalProperties": {
                "$ref": "modelsObject.json#"
            }
        },
        "produces": { "$ref": "#/definitions/mimeTypeArray" },
        "consumes": { "$ref": "#/definitions/mimeTypeArray" },
        "authorizations": { "$ref": "authorizationObject.json#" }
    },
    "additionalProperties": false,
    "definitions": {
        "apiObject": {
            "type": "object",
            "required": [ "path", "operations" ],
            "properties": {
                "path": {
                    "type": "string",
                    "format": "uri-template",
                    "pattern": "^/"
                },
                "description": { "type": "string" },
                "operations": {
                    "type": "array",
                    "items": { "$ref": "operationObject.json#" }
                }
            },
            "additionalProperties": false
        },
        "mimeTypeArray": {
            "type": "array",
            "items": {
                "type": "string",
                "format": "mime-type"
            },
            "uniqueItems": true
        }
    }
}

},{}],151:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/authorizationObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "additionalProperties": {
        "oneOf": [
            {
                "$ref": "#/definitions/basicAuth"
            },
            {
                "$ref": "#/definitions/apiKey"
            },
            {
                "$ref": "#/definitions/oauth2"
            }
        ]
    },
    "definitions": {
        "basicAuth": {
            "required": [ "type" ],
            "properties": {
                "type": { "enum": [ "basicAuth" ] }
            },
            "additionalProperties": false
        },
        "apiKey": {
            "required": [ "type", "passAs", "keyname" ],
            "properties": {
                "type": { "enum": [ "apiKey" ] },
                "passAs": { "enum": [ "header", "query" ] },
                "keyname": { "type": "string" }
            },
            "additionalProperties": false
        },
        "oauth2": {
            "type": "object",
            "required": [ "type", "grantTypes" ],
            "properties": {
                "type": { "enum": [ "oauth2" ] },
                "scopes": {
                    "type": "array",
                    "items": { "$ref": "#/definitions/oauth2Scope" }
                },
                "grantTypes": { "$ref": "oauth2GrantType.json#" }
            },
            "additionalProperties": false
        },
        "oauth2Scope": {
            "type": "object",
            "required": [ "scope" ],
            "properties": {
                "scope": { "type": "string" },
                "description": { "type": "string" }
            },
            "additionalProperties": false
        }
    }
}


},{}],152:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/dataType.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "description": "Data type as described by the specification (version 1.2)",
    "type": "object",
    "oneOf": [
        { "$ref": "#/definitions/refType" },
        { "$ref": "#/definitions/voidType" },
        { "$ref": "#/definitions/primitiveType" },
        { "$ref": "#/definitions/modelType" },
        { "$ref": "#/definitions/arrayType" }
    ],
    "definitions": {
        "refType": {
            "required": [ "$ref" ],
            "properties": {
                "$ref": { "type": "string" }
            },
            "additionalProperties": false
        },
        "voidType": {
            "enum": [ { "type": "void" } ]
        },
        "modelType": {
            "required": [ "type" ],
            "properties": {
                "type": {
                    "type": "string",
                    "not": {
                        "enum": [ "boolean", "integer", "number", "string", "array" ]
                    }
                }
            },
            "additionalProperties": false
        },
        "primitiveType": {
            "required": [ "type" ],
            "properties": {
                "type": {
                    "enum": [ "boolean", "integer", "number", "string" ]
                },
                "format": { "type": "string" },
                "defaultValue": {
                    "not": { "type": [ "array", "object", "null" ] }
                },
                "enum": {
                    "type": "array",
                    "items": { "type": "string" },
                    "minItems": 1,
                    "uniqueItems": true
                },
                "minimum": { "type": "string" },
                "maximum": { "type": "string" }
            },
            "additionalProperties": false,
            "dependencies": {
                "format": {
                    "oneOf": [
                        {
                            "properties": {
                                "type": { "enum": [ "integer" ] },
                                "format": { "enum": [ "int32", "int64" ] }
                            }
                        },
                        {
                            "properties": {
                                "type": { "enum": [ "number" ] },
                                "format": { "enum": [ "float", "double" ] }
                            }
                        },
                        {
                            "properties": {
                                "type": { "enum": [ "string" ] },
                                "format": {
                                    "enum": [ "byte", "date", "date-time" ]
                                }
                            }
                        }
                    ]
                },
                "enum": {
                    "properties": {
                        "type": { "enum": [ "string" ] }
                    }
                },
                "minimum": {
                    "properties": {
                        "type": { "enum": [ "integer", "number" ] }
                    }
                },
                "maximum": {
                    "properties": {
                        "type": { "enum": [ "integer", "number" ] }
                    }
                }
            }
        },
        "arrayType": {
            "required": [ "type", "items" ],
            "properties": {
                "type": { "enum": [ "array" ] },
                "items": {
                    "type": "array",
                    "items": { "$ref": "#/definitions/itemsObject" }
                },
                "uniqueItems": { "type": "boolean" }
            },
            "additionalProperties": false
        },
        "itemsObject": {
            "oneOf": [
                {
                    "$ref": "#/definitions/refType"
                },
                {
                    "allOf": [
                        {
                            "$ref": "#/definitions/primitiveType"
                        },
                        {
                            "properties": {
                                "type": {},
                                "format": {}
                            },
                            "additionalProperties": false
                        }
                    ]
                }
            ]
        }
    }
}
},{}],153:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/dataTypeBase.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "description": "Data type fields (section 4.3.3)",
    "type": "object",
    "oneOf": [
        { "required": [ "type" ] },
        { "required": [ "$ref" ] }
    ],
    "properties": {
        "type": { "type": "string" },
        "$ref": { "type": "string" },
        "format": { "type": "string" },
        "defaultValue": {
            "not": { "type": [ "array", "object", "null" ] }
        },
        "enum": {
            "type": "array",
            "items": { "type": "string" },
            "uniqueItems": true,
            "minItems": 1
        },
        "minimum": { "type": "string" },
        "maximum": { "type": "string" },
        "items": { "$ref": "#/definitions/itemsObject" },
        "uniqueItems": { "type": "boolean" }
    },
    "dependencies": {
        "format": {
            "oneOf": [
                {
                    "properties": {
                        "type": { "enum": [ "integer" ] },
                        "format": { "enum": [ "int32", "int64" ] }
                    }
                },
                {
                    "properties": {
                        "type": { "enum": [ "number" ] },
                        "format": { "enum": [ "float", "double" ] }
                    }
                },
                {
                    "properties": {
                        "type": { "enum": [ "string" ] },
                        "format": {
                            "enum": [ "byte", "date", "date-time" ]
                        }
                    }
                }
            ]
        }
    },
    "definitions": {
        "itemsObject": {
            "oneOf": [
                {
                    "type": "object",
                    "required": [ "$ref" ],
                    "properties": {
                        "$ref": { "type": "string" }
                    },
                    "additionalProperties": false
                },
                {
                    "allOf": [
                        { "$ref": "#" },
                        {
                            "required": [ "type" ],
                            "properties": {
                                "type": {},
                                "format": {}
                            },
                            "additionalProperties": false
                        }
                    ]
                }
            ]
        }
    }
}

},{}],154:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/infoObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "description": "info object (section 5.1.3)",
    "type": "object",
    "required": [ "title", "description" ],
    "properties": {
        "title": { "type": "string" },
        "description": { "type": "string" },
        "termsOfServiceUrl": { "type": "string", "format": "uri" },
        "contact": { "type": "string", "format": "email" },
        "license": { "type": "string" },
        "licenseUrl": { "type": "string", "format": "uri" }
    },
    "additionalProperties": false
}
},{}],155:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/modelsObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [ "id", "properties" ],
    "properties": {
        "id": { "type": "string" },
        "description": { "type": "string" },
        "properties": {
            "type": "object",
            "additionalProperties": { "$ref": "#/definitions/propertyObject" }
        },
        "subTypes": {
            "type": "array",
            "items": { "type": "string" },
            "uniqueItems": true
        },
        "discriminator": { "type": "string" }
    },
    "dependencies": {
        "subTypes": [ "discriminator" ]
    },
    "definitions": {
        "propertyObject": {
            "allOf": [
                {
                    "not": { "$ref": "#" }
                },
                {
                    "$ref": "dataTypeBase.json#"
                }
            ]
        }
    }
}


},{}],156:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/oauth2GrantType.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "minProperties": 1,
    "properties": {
        "implicit": { "$ref": "#/definitions/implicit" },
        "authorization_code": { "$ref": "#/definitions/authorizationCode" }
    },
    "definitions": {
        "implicit": {
            "type": "object",
            "required": [ "loginEndpoint" ],
            "properties": {
                "loginEndpoint": { "$ref": "#/definitions/loginEndpoint" },
                "tokenName": { "type": "string" }
            },
            "additionalProperties": false
        },
        "authorizationCode": {
            "type": "object",
            "required": [ "tokenEndpoint", "tokenRequestEndpoint" ],
            "properties": {
                "tokenEndpoint": { "$ref": "#/definitions/tokenEndpoint" },
                "tokenRequestEndpoint": { "$ref": "#/definitions/tokenRequestEndpoint" }
            },
            "additionalProperties": false
        },
        "loginEndpoint": {
            "type": "object",
            "required": [ "url" ],
            "properties": {
                "url": { "type": "string", "format": "uri" }
            },
            "additionalProperties": false
        },
        "tokenEndpoint": {
            "type": "object",
            "required": [ "url" ],
            "properties": {
                "url": { "type": "string", "format": "uri" },
                "tokenName": { "type": "string" }
            },
            "additionalProperties": false
        },
        "tokenRequestEndpoint": {
            "type": "object",
            "required": [ "url" ],
            "properties": {
                "url": { "type": "string", "format": "uri" },
                "clientIdName": { "type": "string" },
                "clientSecretName": { "type": "string" }
            },
            "additionalProperties": false
        }
    }
}
},{}],157:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/operationObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "allOf": [
        { "$ref": "dataTypeBase.json#" },
        {
            "required": [ "method", "nickname", "parameters" ],
            "properties": {
                "method": { "enum": [ "GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS" ] },
                "summary": { "type": "string", "maxLength": 120 },
                "notes": { "type": "string" },
                "nickname": {
                    "type": "string",
                    "pattern": "^[a-zA-Z0-9_]+$"
                },
                "authorizations": {
                    "type": "object",
                    "additionalProperties": {
                        "type": "array",
                        "items": {
                            "$ref": "authorizationObject.json#/definitions/oauth2Scope"
                        }
                    }
                },
                "parameters": {
                    "type": "array",
                    "items": { "$ref": "parameterObject.json#" }
                },
                "responseMessages": {
                    "type": "array",
                    "items": { "$ref": "#/definitions/responseMessageObject"}
                },
                "produces": { "$ref": "#/definitions/mimeTypeArray" },
                "consumes": { "$ref": "#/definitions/mimeTypeArray" },
                "deprecated": { "enum": [ "true", "false" ] }
            }
        }
    ],
    "definitions": {
        "responseMessageObject": {
            "type": "object",
            "required": [ "code", "message" ],
            "properties": {
                "code": { "$ref": "#/definitions/rfc2616section10" },
                "message": { "type": "string" },
                "responseModel": { "type": "string" }
            }
        },
        "rfc2616section10": {
            "type": "integer",
            "minimum": 100,
            "maximum": 600,
            "exclusiveMaximum": true
        },
        "mimeTypeArray": {
            "type": "array",
            "items": {
                "type": "string",
                "format": "mime-type"
            },
            "uniqueItems": true
        }
    }
}

},{}],158:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/parameterObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "allOf": [
        { "$ref": "dataTypeBase.json#" },
        {
            "required": [ "paramType", "name" ],
            "properties": {
                "paramType": {
                    "enum": [ "path", "query", "body", "header", "form" ]
                },
                "name": { "type": "string" },
                "description": { "type": "string" },
                "required": { "type": "boolean" },
                "allowMultiple": { "type": "boolean" }
            }
        },
        {
            "description": "type File requires special paramType and consumes",
            "oneOf": [
                {
                    "properties": {
                        "type": { "not": { "enum": [ "File" ] } }
                    }
                },
                {
                    "properties": {
                        "type": { "enum": [ "File" ] },
                        "paramType": { "enum": [ "form" ] },
                        "consumes": { "enum": [ "multipart/form-data" ] }
                    }
                }
            ]
        }
    ]
}

},{}],159:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/resourceListing.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [ "swaggerVersion", "apis" ],
    "properties": {
        "swaggerVersion": { "enum": [ "1.2" ] },
        "apis": {
            "type": "array",
            "items": { "$ref": "resourceObject.json#" }
        },
        "apiVersion": { "type": "string" },
        "info": { "$ref": "infoObject.json#" },
        "authorizations": { "$ref": "authorizationObject.json#" }
    }
}

},{}],160:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/resourceObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [ "path" ],
    "properties": {
        "path": { "type": "string", "format": "uri" },
        "description": { "type": "string" }
    },
    "additionalProperties": false
}
},{}],161:[function(require,module,exports){
module.exports={
  "title": "A JSON Schema for Swagger 2.0 API.",
  "id": "http://swagger.io/v2/schema.json#",
  "$schema": "http://json-schema.org/draft-04/schema#",
  "type": "object",
  "required": [
    "swagger",
    "info",
    "paths"
  ],
  "additionalProperties": false,
  "patternProperties": {
    "^x-": {
      "$ref": "#/definitions/vendorExtension"
    }
  },
  "properties": {
    "swagger": {
      "type": "string",
      "enum": [
        "2.0"
      ],
      "description": "The Swagger version of this document."
    },
    "info": {
      "$ref": "#/definitions/info"
    },
    "host": {
      "type": "string",
      "format": "uri",
      "pattern": "^[^{}/ :\\\\]+(?::\\d+)?$",
      "description": "The fully qualified URI to the host of the API."
    },
    "basePath": {
      "type": "string",
      "pattern": "^/",
      "description": "The base path to the API. Example: '/api'."
    },
    "schemes": {
      "$ref": "#/definitions/schemesList"
    },
    "consumes": {
      "description": "A list of MIME types accepted by the API.",
      "$ref": "#/definitions/mediaTypeList"
    },
    "produces": {
      "description": "A list of MIME types the API can produce.",
      "$ref": "#/definitions/mediaTypeList"
    },
    "paths": {
      "$ref": "#/definitions/paths"
    },
    "definitions": {
      "$ref": "#/definitions/definitions"
    },
    "parameters": {
      "$ref": "#/definitions/parameterDefinitions"
    },
    "responses": {
      "$ref": "#/definitions/responseDefinitions"
    },
    "security": {
      "$ref": "#/definitions/security"
    },
    "securityDefinitions": {
      "$ref": "#/definitions/securityDefinitions"
    },
    "tags": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/tag"
      },
      "uniqueItems": true
    },
    "externalDocs": {
      "$ref": "#/definitions/externalDocs"
    }
  },
  "definitions": {
    "info": {
      "type": "object",
      "description": "General information about the API.",
      "required": [
        "version",
        "title"
      ],
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "title": {
          "type": "string",
          "description": "A unique and precise title of the API."
        },
        "version": {
          "type": "string",
          "description": "A semantic version number of the API."
        },
        "description": {
          "type": "string",
          "description": "A longer description of the API. Should be different from the title.  Github-flavored markdown is allowed."
        },
        "termsOfService": {
          "type": "string",
          "description": "The terms of service for the API."
        },
        "contact": {
          "$ref": "#/definitions/contact"
        },
        "license": {
          "$ref": "#/definitions/license"
        }
      }
    },
    "contact": {
      "type": "object",
      "description": "Contact information for the owners of the API.",
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string",
          "description": "The identifying name of the contact person/organization."
        },
        "url": {
          "type": "string",
          "description": "The URL pointing to the contact information.",
          "format": "uri"
        },
        "email": {
          "type": "string",
          "description": "The email address of the contact person/organization.",
          "format": "email"
        }
      }
    },
    "license": {
      "type": "object",
      "required": [
        "name"
      ],
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string",
          "description": "The name of the license type. It's encouraged to use an OSI compatible license."
        },
        "url": {
          "type": "string",
          "description": "The URL pointing to the license.",
          "format": "uri"
        }
      }
    },
    "paths": {
      "type": "object",
      "description": "Relative paths to the individual endpoints. They must be relative to the 'basePath'.",
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        },
        "^/": {
          "$ref": "#/definitions/pathItem"
        }
      },
      "additionalProperties": false
    },
    "definitions": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/schema"
      },
      "description": "One or more JSON objects describing the schemas being consumed and produced by the API."
    },
    "parameterDefinitions": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/parameter"
      },
      "description": "One or more JSON representations for parameters"
    },
    "responseDefinitions": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/response"
      },
      "description": "One or more JSON representations for parameters"
    },
    "externalDocs": {
      "type": "object",
      "additionalProperties": false,
      "description": "information about external documentation",
      "required": [
        "url"
      ],
      "properties": {
        "description": {
          "type": "string"
        },
        "url": {
          "type": "string",
          "format": "uri"
        }
      }
    },
    "examples": {
      "type": "object",
      "patternProperties": {
        "^[a-z0-9-]+/[a-z0-9\\-+]+$": {}
      },
      "additionalProperties": false
    },
    "mimeType": {
      "type": "string",
      "description": "The MIME type of the HTTP message."
    },
    "operation": {
      "type": "object",
      "required": [
        "responses"
      ],
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "uniqueItems": true
        },
        "summary": {
          "type": "string",
          "description": "A brief summary of the operation."
        },
        "description": {
          "type": "string",
          "description": "A longer description of the operation, github-flavored markdown is allowed."
        },
        "externalDocs": {
          "$ref": "#/definitions/externalDocs"
        },
        "operationId": {
          "type": "string",
          "description": "A friendly name of the operation"
        },
        "produces": {
          "description": "A list of MIME types the API can produce.",
          "$ref": "#/definitions/mediaTypeList"
        },
        "consumes": {
          "description": "A list of MIME types the API can consume.",
          "$ref": "#/definitions/mediaTypeList"
        },
        "parameters": {
          "$ref": "#/definitions/parametersList"
        },
        "responses": {
          "$ref": "#/definitions/responses"
        },
        "schemes": {
          "$ref": "#/definitions/schemesList"
        },
        "deprecated": {
          "type": "boolean",
          "default": false
        },
        "security": {
          "$ref": "#/definitions/security"
        }
      }
    },
    "pathItem": {
      "type": "object",
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "$ref": {
          "type": "string"
        },
        "get": {
          "$ref": "#/definitions/operation"
        },
        "put": {
          "$ref": "#/definitions/operation"
        },
        "post": {
          "$ref": "#/definitions/operation"
        },
        "delete": {
          "$ref": "#/definitions/operation"
        },
        "options": {
          "$ref": "#/definitions/operation"
        },
        "head": {
          "$ref": "#/definitions/operation"
        },
        "patch": {
          "$ref": "#/definitions/operation"
        },
        "parameters": {
          "$ref": "#/definitions/parametersList"
        }
      }
    },
    "responses": {
      "type": "object",
      "description": "Response objects names can either be any valid HTTP status code or 'default'.",
      "minProperties": 1,
      "additionalProperties": false,
      "patternProperties": {
        "^([0-9]{3})$|^(default)$": {
          "$ref": "#/definitions/responseValue"
        },
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "not": {
        "type": "object",
        "additionalProperties": false,
        "patternProperties": {
          "^x-": {
            "$ref": "#/definitions/vendorExtension"
          }
        }
      }
    },
    "responseValue": {
      "oneOf": [
        {
          "$ref": "#/definitions/response"
        },
        {
          "$ref": "#/definitions/jsonReference"
        }
      ]
    },
    "response": {
      "type": "object",
      "required": [
        "description"
      ],
      "properties": {
        "description": {
          "type": "string"
        },
        "schema": {
          "$ref": "#/definitions/schema"
        },
        "headers": {
          "$ref": "#/definitions/headers"
        },
        "examples": {
          "$ref": "#/definitions/examples"
        }
      },
      "additionalProperties": false
    },
    "headers": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/header"
      }
    },
    "header": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "integer",
            "boolean",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormat"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        },
        "description": {
          "type": "string"
        }
      }
    },
    "vendorExtension": {
      "description": "Any property starting with x- is valid.",
      "additionalProperties": true,
      "additionalItems": true
    },
    "bodyParameter": {
      "type": "object",
      "required": [
        "name",
        "in",
        "schema"
      ],
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  Github-flavored markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "body"
          ]
        },
        "required": {
          "type": "boolean",
          "description": "Determines whether or not this parameter is required or optional.",
          "default": false
        },
        "schema": {
          "$ref": "#/definitions/schema"
        }
      },
      "additionalProperties": false
    },
    "headerParameterSubSchema": {
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "required": {
          "type": "boolean",
          "description": "Determines whether or not this parameter is required or optional.",
          "default": false
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "header"
          ]
        },
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  Github-flavored markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "boolean",
            "integer",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormat"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "queryParameterSubSchema": {
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "required": {
          "type": "boolean",
          "description": "Determines whether or not this parameter is required or optional.",
          "default": false
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "query"
          ]
        },
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  Github-flavored markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "allowEmptyValue": {
          "type": "boolean",
          "default": false,
          "description": "allows sending a parameter by name only or with an empty value."
        },
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "boolean",
            "integer",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormatWithMulti"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "formDataParameterSubSchema": {
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "required": {
          "type": "boolean",
          "description": "Determines whether or not this parameter is required or optional.",
          "default": false
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "formData"
          ]
        },
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  Github-flavored markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "allowEmptyValue": {
          "type": "boolean",
          "default": false,
          "description": "allows sending a parameter by name only or with an empty value."
        },
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "boolean",
            "integer",
            "array",
            "file"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormatWithMulti"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "pathParameterSubSchema": {
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "required": {
          "type": "boolean",
          "enum": [
            true
          ],
          "description": "Determines whether or not this parameter is required or optional."
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "path"
          ]
        },
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  Github-flavored markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "boolean",
            "integer",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormat"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "nonBodyParameter": {
      "type": "object",
      "required": [
        "name",
        "in",
        "type"
      ],
      "oneOf": [
        {
          "$ref": "#/definitions/headerParameterSubSchema"
        },
        {
          "$ref": "#/definitions/formDataParameterSubSchema"
        },
        {
          "$ref": "#/definitions/queryParameterSubSchema"
        },
        {
          "$ref": "#/definitions/pathParameterSubSchema"
        }
      ]
    },
    "parameter": {
      "oneOf": [
        {
          "$ref": "#/definitions/bodyParameter"
        },
        {
          "$ref": "#/definitions/nonBodyParameter"
        }
      ]
    },
    "schema": {
      "type": "object",
      "description": "A deterministic version of a JSON Schema object.",
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "$ref": {
          "type": "string"
        },
        "format": {
          "type": "string"
        },
        "title": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/title"
        },
        "description": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/description"
        },
        "default": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/default"
        },
        "multipleOf": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/multipleOf"
        },
        "maximum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
        },
        "minLength": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
        },
        "pattern": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/pattern"
        },
        "maxItems": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
        },
        "minItems": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
        },
        "uniqueItems": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/uniqueItems"
        },
        "maxProperties": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
        },
        "minProperties": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
        },
        "required": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/stringArray"
        },
        "enum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/enum"
        },
        "additionalProperties": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/additionalProperties"
        },
        "type": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/type"
        },
        "items": {
          "anyOf": [
            {
              "$ref": "#/definitions/schema"
            },
            {
              "type": "array",
              "minItems": 1,
              "items": {
                "$ref": "#/definitions/schema"
              }
            }
          ],
          "default": {}
        },
        "allOf": {
          "type": "array",
          "minItems": 1,
          "items": {
            "$ref": "#/definitions/schema"
          }
        },
        "properties": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/definitions/schema"
          },
          "default": {}
        },
        "discriminator": {
          "type": "string"
        },
        "readOnly": {
          "type": "boolean",
          "default": false
        },
        "xml": {
          "$ref": "#/definitions/xml"
        },
        "externalDocs": {
          "$ref": "#/definitions/externalDocs"
        },
        "example": {}
      },
      "additionalProperties": false
    },
    "primitivesItems": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "integer",
            "boolean",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormat"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "security": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/securityRequirement"
      },
      "uniqueItems": true
    },
    "securityRequirement": {
      "type": "object",
      "additionalProperties": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "uniqueItems": true
      }
    },
    "xml": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string"
        },
        "namespace": {
          "type": "string"
        },
        "prefix": {
          "type": "string"
        },
        "attribute": {
          "type": "boolean",
          "default": false
        },
        "wrapped": {
          "type": "boolean",
          "default": false
        }
      }
    },
    "tag": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "name"
      ],
      "properties": {
        "name": {
          "type": "string"
        },
        "description": {
          "type": "string"
        },
        "externalDocs": {
          "$ref": "#/definitions/externalDocs"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "securityDefinitions": {
      "type": "object",
      "additionalProperties": {
        "oneOf": [
          {
            "$ref": "#/definitions/basicAuthenticationSecurity"
          },
          {
            "$ref": "#/definitions/apiKeySecurity"
          },
          {
            "$ref": "#/definitions/oauth2ImplicitSecurity"
          },
          {
            "$ref": "#/definitions/oauth2PasswordSecurity"
          },
          {
            "$ref": "#/definitions/oauth2ApplicationSecurity"
          },
          {
            "$ref": "#/definitions/oauth2AccessCodeSecurity"
          }
        ]
      }
    },
    "basicAuthenticationSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "basic"
          ]
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "apiKeySecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "name",
        "in"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "apiKey"
          ]
        },
        "name": {
          "type": "string"
        },
        "in": {
          "type": "string",
          "enum": [
            "header",
            "query"
          ]
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2ImplicitSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "flow",
        "authorizationUrl"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "oauth2"
          ]
        },
        "flow": {
          "type": "string",
          "enum": [
            "implicit"
          ]
        },
        "scopes": {
          "$ref": "#/definitions/oauth2Scopes"
        },
        "authorizationUrl": {
          "type": "string",
          "format": "uri"
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2PasswordSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "flow",
        "tokenUrl"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "oauth2"
          ]
        },
        "flow": {
          "type": "string",
          "enum": [
            "password"
          ]
        },
        "scopes": {
          "$ref": "#/definitions/oauth2Scopes"
        },
        "tokenUrl": {
          "type": "string",
          "format": "uri"
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2ApplicationSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "flow",
        "tokenUrl"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "oauth2"
          ]
        },
        "flow": {
          "type": "string",
          "enum": [
            "application"
          ]
        },
        "scopes": {
          "$ref": "#/definitions/oauth2Scopes"
        },
        "tokenUrl": {
          "type": "string",
          "format": "uri"
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2AccessCodeSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "flow",
        "authorizationUrl",
        "tokenUrl"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "oauth2"
          ]
        },
        "flow": {
          "type": "string",
          "enum": [
            "accessCode"
          ]
        },
        "scopes": {
          "$ref": "#/definitions/oauth2Scopes"
        },
        "authorizationUrl": {
          "type": "string",
          "format": "uri"
        },
        "tokenUrl": {
          "type": "string",
          "format": "uri"
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2Scopes": {
      "type": "object",
      "additionalProperties": {
        "type": "string"
      }
    },
    "mediaTypeList": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/mimeType"
      },
      "uniqueItems": true
    },
    "parametersList": {
      "type": "array",
      "description": "The parameters needed to send a valid API call.",
      "additionalItems": false,
      "items": {
        "oneOf": [
          {
            "$ref": "#/definitions/parameter"
          },
          {
            "$ref": "#/definitions/jsonReference"
          }
        ]
      },
      "uniqueItems": true
    },
    "schemesList": {
      "type": "array",
      "description": "The transfer protocol of the API.",
      "items": {
        "type": "string",
        "enum": [
          "http",
          "https",
          "ws",
          "wss"
        ]
      },
      "uniqueItems": true
    },
    "collectionFormat": {
      "type": "string",
      "enum": [
        "csv",
        "ssv",
        "tsv",
        "pipes"
      ],
      "default": "csv"
    },
    "collectionFormatWithMulti": {
      "type": "string",
      "enum": [
        "csv",
        "ssv",
        "tsv",
        "pipes",
        "multi"
      ],
      "default": "csv"
    },
    "title": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/title"
    },
    "description": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/description"
    },
    "default": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/default"
    },
    "multipleOf": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/multipleOf"
    },
    "maximum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/maximum"
    },
    "exclusiveMaximum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/exclusiveMaximum"
    },
    "minimum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/minimum"
    },
    "exclusiveMinimum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/exclusiveMinimum"
    },
    "maxLength": {
      "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
    },
    "minLength": {
      "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
    },
    "pattern": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/pattern"
    },
    "maxItems": {
      "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
    },
    "minItems": {
      "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
    },
    "uniqueItems": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/uniqueItems"
    },
    "enum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/enum"
    },
    "jsonReference": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "$ref": {
          "type": "string"
        }
      }
    }
  }
}
},{}],162:[function(require,module,exports){
arguments[4][149][0].apply(exports,arguments)
},{"dup":149}]},{},[1])(1)
});