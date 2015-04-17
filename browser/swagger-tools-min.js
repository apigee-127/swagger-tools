!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var o;"undefined"!=typeof window?o=window:"undefined"!=typeof global?o=global:"undefined"!=typeof self&&(o=self),(o.SwaggerTools||(o.SwaggerTools={})).specs=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
"use strict";var _=window._,async=window.async,helpers=require("./helpers"),JsonRefs=window.JsonRefs,SparkMD5=window.SparkMD5,swaggerConverter=window.SwaggerConverter.convert,traverse=window.traverse,validators=require("./validators");_.isPlainObject(swaggerConverter)&&(swaggerConverter=global.SwaggerConverter.convert);var documentCache={},validOptionNames=_.map(helpers.swaggerOperationMethods,function(e){return e.toLowerCase()}),addExternalRefsToValidator=function e(r,n,i){var t=_.reduce(JsonRefs.findRefs(n),function(e,r,n){return JsonRefs.isRemotePointer(n)&&e.push(r.split("#")[0]),e},[]),o=function(n,i){JsonRefs.resolveRefs({$ref:n},function(n,t){return n?i(n):void e(r,t,function(e,r){i(e,r)})})};t.length>0?async.map(t,o,function(e,n){return e?i(e):(_.each(n,function(e,n){r.setRemoteReference(t[n],e)}),void i())}):i()},createErrorOrWarning=function(e,r,n,i){i.push({code:e,message:r,path:n})},addReference=function(e,r,n,i,t){var o,a,s,c,d,u=!0,f=helpers.getSwaggerVersion(e.resolved),h=_.isArray(r)?r:JsonRefs.pathFromPointer(r),p=_.isArray(r)?JsonRefs.pathToPointer(r):r,l=_.isArray(n)?n:JsonRefs.pathFromPointer(n),g=_.isArray(n)?JsonRefs.pathToPointer(n):n;return 0===h.length?(createErrorOrWarning("INVALID_REFERENCE","Not a valid JSON Reference",l,i.errors),!1):(a=e.definitions[p],d=h[0],o="securityDefinitions"===d?"SECURITY_DEFINITION":d.substring(0,d.length-1).toUpperCase(),s="1.2"===f?h[h.length-1]:p,c="securityDefinitions"===d?"Security definition":o.charAt(0)+o.substring(1).toLowerCase(),["authorizations","securityDefinitions"].indexOf(h[0])>-1&&"scopes"===h[2]&&(o+="_SCOPE",c+=" scope"),_.isUndefined(a)?(t||createErrorOrWarning("UNRESOLVABLE_"+o,c+" could not be resolved: "+s,l,i.errors),u=!1):(_.isUndefined(a.references)&&(a.references=[]),a.references.push(g)),u)},getOrComposeSchema=function r(e,n){var i,t,o="Composed "+("1.2"===e.swaggerVersion?JsonRefs.pathFromPointer(n).pop():n),a=e.definitions[n],s=traverse(e.original),c=traverse(e.resolved);return a?(t=_.cloneDeep(s.get(JsonRefs.pathFromPointer(n))),i=_.cloneDeep(c.get(JsonRefs.pathFromPointer(n))),"1.2"===e.swaggerVersion&&(a.lineage.length>0&&(i.allOf=[],_.each(a.lineage,function(n){i.allOf.push(r(e,n))})),delete i.subTypes,_.each(i.properties,function(n,i){var o=t.properties[i];_.each(["maximum","minimum"],function(e){_.isString(n[e])&&(n[e]=parseFloat(n[e]))}),_.each(JsonRefs.findRefs(o),function(i,t){var o="#/models/"+i,a=e.definitions[o],s=JsonRefs.pathFromPointer(t);a.lineage.length>0?traverse(n).set(s.slice(0,s.length-1),r(e,o)):traverse(n).set(s.slice(0,s.length-1).concat("title"),"Composed "+i)})})),i=traverse(i).map(function(e){"id"===this.key&&_.isString(e)&&this.remove()}),i.title=o,i):void 0},createUnusedErrorOrWarning=function(e,r,n,i,t){createErrorOrWarning("UNUSED_"+r,n+" is defined but is not used: "+e,i,t)},getDocumentCache=function(e){var r=SparkMD5.hash(JSON.stringify(e)),n=documentCache[r]||_.find(documentCache,function(e){return e.resolvedId===r});return n||(n=documentCache[r]={definitions:{},original:e,resolved:void 0,swaggerVersion:helpers.getSwaggerVersion(e)}),n},handleValidationError=function(e,r){var n=new Error("The Swagger document(s) are invalid");n.errors=e.errors,n.failedValidation=!0,n.warnings=e.warnings,e.apiDeclarations&&(n.apiDeclarations=e.apiDeclarations),r(n)},normalizePath=function(e){var r=e.match(/\{(.*?)\}/g),n=[],i=e;return r&&_.each(r,function(e,r){i=i.replace(e,"{"+r+"}"),n.push(e.replace(/[{}]/g,""))}),{path:i,args:n}},validateNoExist=function(e,r,n,i,t,o){!_.isUndefined(e)&&e.indexOf(r)>-1&&createErrorOrWarning("DUPLICATE_"+n,i+" already defined: "+r,t,o)},validateSchemaConstraints=function(e,r,n,i,t){try{validators.validateSchemaConstraints(e.swaggerVersion,r,n,void 0)}catch(o){t||createErrorOrWarning(o.code,o.message,o.path,i.errors)}},processDocument=function(e,r){var n=e.swaggerVersion,i=function(r,n){var i=JsonRefs.pathToPointer(r),t=e.definitions[i];return t||(t=e.definitions[i]={inline:n||!1,references:[]},["definitions","models"].indexOf(JsonRefs.pathFromPointer(i)[0])>-1&&(t.cyclical=!1,t.lineage=void 0,t.parents=[])),t},t=function(e){return"1.2"===n?JsonRefs.pathFromPointer(e).pop():e},o=function c(r,n,i){var t=e.definitions[n||r];t&&_.each(t.parents,function(e){i.push(e),r!==e&&c(r,e,i)})},a="1.2"===n?"authorizations":"securityDefinitions",s="1.2"===n?"models":"definitions";switch(_.each(e.resolved[a],function(e,t){var o=[a,t];("1.2"!==n||e.type)&&(i(o),_.reduce(e.scopes,function(e,t,a){var s="1.2"===n?t.scope:a,c=o.concat(["scopes",a.toString()]),d=i(o.concat(["scopes",s]));return d.scopePath=c,validateNoExist(e,s,"AUTHORIZATION_SCOPE_DEFINITION","Authorization scope definition","1.2"===n?c.concat("scope"):c,r.warnings),e.push(s),e},[]))}),_.each(e.resolved[s],function(t,o){var a=[s,o],c=i(a);if("1.2"===n&&o!==t.id&&createErrorOrWarning("MODEL_ID_MISMATCH","Model id does not match id in models object: "+t.id,a.concat("id"),r.errors),_.isUndefined(c.lineage))switch(n){case"1.2":_.each(t.subTypes,function(n,t){var o=["models",n],c=JsonRefs.pathToPointer(o),d=e.definitions[c],u=a.concat(["subTypes",t.toString()]);!d&&e.resolved[s][n]&&(d=i(o)),addReference(e,o,u,r)&&d.parents.push(JsonRefs.pathToPointer(a))});break;default:_.each(e.original[s][o].allOf,function(r,n){var t,o=!1;_.isUndefined(r.$ref)||JsonRefs.isRemotePointer(r.$ref)?(o=!0,t=a.concat(["allOf",n.toString()])):t=JsonRefs.pathFromPointer(r.$ref),_.isUndefined(traverse(e.resolved).get(t))||(i(t,o),c.parents.push(JsonRefs.pathToPointer(t)))})}}),n){case"2.0":_.each(e.resolved.parameters,function(n,t){var o=["parameters",t];i(o),validateSchemaConstraints(e,n,o,r)}),_.each(e.resolved.responses,function(n,t){var o=["responses",t];i(o),validateSchemaConstraints(e,n,o,r)})}_.each(e.definitions,function(i,a){var s,c,d,u=JsonRefs.pathFromPointer(a),f=traverse(e.original).get(u),h=u[0],p=h.substring(0,h.length-1).toUpperCase(),l=p.charAt(0)+p.substring(1).toLowerCase();-1!==["definitions","models"].indexOf(h)&&(s=[],c=[],d=i.lineage,_.isUndefined(d)&&(d=[],o(a,void 0,d),d.reverse(),i.lineage=_.cloneDeep(d),i.cyclical=d.length>1&&d[0]===a),i.parents.length>1&&"1.2"===n&&createErrorOrWarning("MULTIPLE_"+p+"_INHERITANCE","Child "+p.toLowerCase()+" is sub type of multiple models: "+_.map(i.parents,function(e){return t(e)}).join(" && "),u,r.errors),i.cyclical&&createErrorOrWarning("CYCLICAL_"+p+"_INHERITANCE",l+" has a circular inheritance: "+_.map(d,function(e){return t(e)}).join(" -> ")+" -> "+t(a),u.concat("1.2"===n?"subTypes":"allOf"),r.errors),_.each(d.slice(i.cyclical?1:0),function(r){var n=traverse(e.resolved).get(JsonRefs.pathFromPointer(r));_.each(Object.keys(n.properties||{}),function(e){-1===c.indexOf(e)&&c.push(e)})}),validateSchemaConstraints(e,f,u,r),_.each(f.properties,function(n,i){var t=u.concat(["properties",i]);_.isUndefined(n)||(validateSchemaConstraints(e,n,t,r),c.indexOf(i)>-1?createErrorOrWarning("CHILD_"+p+"_REDECLARES_PROPERTY","Child "+p.toLowerCase()+" declares property already declared by ancestor: "+i,t,r.errors):s.push(i))}),_.each(f.required||[],function(e,i){var t="1.2"===n?"Model":"Definition";-1===c.indexOf(e)&&-1===s.indexOf(e)&&createErrorOrWarning("MISSING_REQUIRED_"+t.toUpperCase()+"_PROPERTY",t+" requires property but it is not defined: "+e,u.concat(["required",i.toString()]),r.errors)}))}),_.each(JsonRefs.findRefs(e.original),function(n,i){"1.2"===e.swaggerVersion&&(n="#/models/"+n),JsonRefs.isRemotePointer(n)||addReference(e,n,i,r)})},validateExist=function(e,r,n,i,t,o){_.isUndefined(e)||-1!==e.indexOf(r)||createErrorOrWarning("UNRESOLVABLE_"+n,i+" could not be resolved: "+r,t,o)},processAuthRefs=function(e,r,n,i){var t="1.2"===e.swaggerVersion?"AUTHORIZATION":"SECURITY_DEFINITION",o="AUTHORIZATION"===t?"Authorization":"Security definition";"1.2"===e.swaggerVersion?_.reduce(r,function(r,a,s){var c=["authorizations",s],d=n.concat([s]);return addReference(e,c,d,i)&&_.reduce(a,function(r,n,a){var s=d.concat(a.toString(),"scope"),u=c.concat(["scopes",n.scope]);return validateNoExist(r,n.scope,t+"_SCOPE_REFERENCE",o+" scope reference",s,i.warnings),addReference(e,u,s,i),r.concat(n.scope)},[]),r.concat(s)},[]):_.reduce(r,function(r,a,s){return _.each(a,function(a,c){var d=["securityDefinitions",c],u=n.concat(s.toString(),c);validateNoExist(r,c,t+"_REFERENCE",o+" reference",u,i.warnings),r.push(c),addReference(e,d,u,i)&&_.each(a,function(r,n){var t=d.concat(["scopes",r]);addReference(e,t,u.concat(n.toString()),i)})}),r},[])},resolveRefs=function(e,r){var n,i=getDocumentCache(e),t=helpers.getSwaggerVersion(e);i.resolved?r():("1.2"===t&&(e=_.cloneDeep(e),n=traverse(e),_.each(JsonRefs.findRefs(e),function(e,r){n.set(JsonRefs.pathFromPointer(r),"#/models/"+e)})),JsonRefs.resolveRefs(e,function(e,n){return e?r(e):(i.resolved=n,i.resolvedId=SparkMD5.hash(JSON.stringify(n)),void r())}))},validateAgainstSchema=function(e,r,n,i){var t=_.isString(r)?e.validators[r]:helpers.createJsonValidator(),o=function(){try{validators.validateAgainstSchema(r,n,t)}catch(e){return e.failedValidation?i(void 0,e.results):i(e)}resolveRefs(n,function(e){return i(e)})};addExternalRefsToValidator(t,n,function(e){return e?i(e):void o()})},validateDefinitions=function(e,r){_.each(e.definitions,function(n,i){var t=JsonRefs.pathFromPointer(i),o=t[0].substring(0,t[0].length-1),a="1.2"===e.swaggerVersion?t[t.length-1]:i,s="securityDefinition"===o?"SECURITY_DEFINITION":o.toUpperCase(),c="securityDefinition"===o?"Security definition":o.charAt(0).toUpperCase()+o.substring(1);0!==n.references.length||n.inline||(n.scopePath&&(s+="_SCOPE",c+=" scope",t=n.scopePath),createUnusedErrorOrWarning(a,s,c,t,r.warnings))})},validateParameters=function(e,r,n,i,t,o,a){var s=[],c=!1;_.reduce(i,function(i,a,d){var u=t.concat(["parameters",d.toString()]);if(!_.isUndefined(a))return validateNoExist(i,a.name,"PARAMETER","Parameter",u.concat("name"),o.errors),"body"===a.paramType||"body"===a["in"]?(c===!0&&createErrorOrWarning("DULPICATE_API_BODY_PARAMETER","API has more than one body parameter",u,o.errors),c=!0):("path"===a.paramType||"path"===a["in"])&&(-1===n.args.indexOf(a.name)&&createErrorOrWarning("UNRESOLVABLE_API_PATH_PARAMETER","API path parameter could not be resolved: "+a.name,u.concat("name"),o.errors),s.push(a.name)),-1===e.primitives.indexOf(a.type)&&"1.2"===e.version&&addReference(r,"#/models/"+a.type,u.concat("type"),o),validateSchemaConstraints(r,a,u,o,a.skipErrors),i.concat(a.name)},[]),(_.isUndefined(a)||a===!1)&&_.each(_.difference(n.args,s),function(e){createErrorOrWarning("MISSING_API_PATH_PARAMETER","API requires path parameter but it is not defined: "+e,"1.2"===r.swaggerVersion?t.slice(0,2).concat("path"):t,o.errors)})},validateSwagger1_2=function(e,r,n,i){var t=[],o=getDocumentCache(r),a=[],s={errors:[],warnings:[],apiDeclarations:[]};a=_.reduce(r.apis,function(e,r,n){return validateNoExist(e,r.path,"RESOURCE_PATH","Resource path",["apis",n.toString(),"path"],s.errors),e.push(r.path),e},[]),processDocument(o,s),t=_.reduce(n,function(r,n,i){var c=s.apiDeclarations[i]={errors:[],warnings:[]},d=getDocumentCache(n);return validateNoExist(r,n.resourcePath,"RESOURCE_PATH","Resource path",["resourcePath"],c.errors),-1===t.indexOf(n.resourcePath)&&(validateExist(a,n.resourcePath,"RESOURCE_PATH","Resource path",["resourcePath"],c.errors),r.push(n.resourcePath)),processDocument(d,c),_.reduce(n.apis,function(r,n,i){var t=["apis",i.toString()],a=normalizePath(n.path);return r.indexOf(a.path)>-1?createErrorOrWarning("DUPLICATE_API_PATH","API path (or equivalent) already defined: "+n.path,t.concat("path"),c.errors):r.push(a.path),_.reduce(n.operations,function(r,n,i){var s=t.concat(["operations",i.toString()]);return validateNoExist(r,n.method,"OPERATION_METHOD","Operation method",s.concat("method"),c.errors),r.push(n.method),-1===e.primitives.indexOf(n.type)&&"1.2"===e.version&&addReference(d,"#/models/"+n.type,s.concat("type"),c),processAuthRefs(o,n.authorizations,s.concat("authorizations"),c),validateSchemaConstraints(d,n,s,c),validateParameters(e,d,a,n.parameters,s,c),_.reduce(n.responseMessages,function(e,r,n){var i=s.concat(["responseMessages",n.toString()]);return validateNoExist(e,r.code,"RESPONSE_MESSAGE_CODE","Response message code",i.concat(["code"]),c.errors),r.responseModel&&addReference(d,"#/models/"+r.responseModel,i.concat("responseModel"),c),e.concat(r.code)},[]),r},[]),r},[]),validateDefinitions(d,c),r},[]),validateDefinitions(o,s),_.each(_.difference(a,t),function(e){var n=a.indexOf(e);createUnusedErrorOrWarning(r.apis[n].path,"RESOURCE_PATH","Resource path",["apis",n.toString(),"path"],s.errors)}),i(void 0,s)},validateSwagger2_0=function(e,r,n){var i=getDocumentCache(r),t={errors:[],warnings:[]};processDocument(i,t),processAuthRefs(i,r.security,["security"],t),_.reduce(i.resolved.paths,function(r,n,o){var a=["paths",o],s=normalizePath(o);return r.indexOf(s.path)>-1&&createErrorOrWarning("DUPLICATE_API_PATH","API path (or equivalent) already defined: "+o,a,t.errors),validateParameters(e,i,s,n.parameters,a,t,!0),_.each(n,function(r,o){var c=[],d=a.concat(o),u=[];-1!==validOptionNames.indexOf(o)&&(processAuthRefs(i,r.security,d.concat("security"),t),_.each(r.parameters,function(e){c.push(e),u.push(e.name+":"+e["in"])}),_.each(n.parameters,function(e){var r=_.cloneDeep(e);r.skipErrors=!0,-1===u.indexOf(e.name+":"+e["in"])&&c.push(r)}),validateParameters(e,i,s,c,d,t),_.each(r.responses,function(e,r){_.isUndefined(e)||validateSchemaConstraints(i,e,d.concat("responses",r),t)}))}),r.concat(s.path)},[]),validateDefinitions(i,t),n(void 0,t)},validateSemantically=function(e,r,n,i){var t=function(e,r){i(e,helpers.formatResults(r))};"1.2"===e.version?validateSwagger1_2(e,r,n,t):validateSwagger2_0(e,r,t)},validateStructurally=function(e,r,n,i){validateAgainstSchema(e,"1.2"===e.version?"resourceListing.json":"schema.json",r,function(r,t){return r?i(r):void(t||"1.2"!==e.version?i(void 0,t):(t={errors:[],warnings:[],apiDeclarations:[]},async.map(n,function(r,n){validateAgainstSchema(e,"apiDeclaration.json",r,n)},function(e,r){return e?i(e):(_.each(r,function(e,r){t.apiDeclarations[r]=e}),void i(void 0,t))})))})},Specification=function(e){var r=function(e,r){return _.reduce(r,function(e,r,n){return e[n]=helpers.createJsonValidator(r),e}.bind(this),{})},n=function(e){var r=_.cloneDeep(this.schemas[e]);return r.id=e,r}.bind(this),i=["string","number","boolean","integer","array"];switch(e){case"1.2":this.docsUrl="https://github.com/swagger-api/swagger-spec/blob/master/versions/1.2.md",this.primitives=_.union(i,["void","File"]),this.schemasUrl="https://github.com/swagger-api/swagger-spec/tree/master/schemas/v1.2",this.schemas={"apiDeclaration.json":require("../schemas/1.2/apiDeclaration.json"),"authorizationObject.json":require("../schemas/1.2/authorizationObject.json"),"dataType.json":require("../schemas/1.2/dataType.json"),"dataTypeBase.json":require("../schemas/1.2/dataTypeBase.json"),"infoObject.json":require("../schemas/1.2/infoObject.json"),"modelsObject.json":require("../schemas/1.2/modelsObject.json"),"oauth2GrantType.json":require("../schemas/1.2/oauth2GrantType.json"),"operationObject.json":require("../schemas/1.2/operationObject.json"),"parameterObject.json":require("../schemas/1.2/parameterObject.json"),"resourceListing.json":require("../schemas/1.2/resourceListing.json"),"resourceObject.json":require("../schemas/1.2/resourceObject.json")},this.validators=r(this,{"apiDeclaration.json":_.map(["dataTypeBase.json","modelsObject.json","oauth2GrantType.json","authorizationObject.json","parameterObject.json","operationObject.json","apiDeclaration.json"],n),"resourceListing.json":_.map(["resourceObject.json","infoObject.json","oauth2GrantType.json","authorizationObject.json","resourceListing.json"],n)});break;case"2.0":this.docsUrl="https://github.com/swagger-api/swagger-spec/blob/master/versions/2.0.md",this.primitives=_.union(i,["file"]),this.schemasUrl="https://github.com/swagger-api/swagger-spec/tree/master/schemas/v2.0",this.schemas={"schema.json":require("../schemas/2.0/schema.json")},this.validators=r(this,{"schema.json":[n("schema.json")]});break;default:throw new Error(e+" is an unsupported Swagger specification version")}this.version=e};Specification.prototype.validate=function(e,r,n){switch(this.version){case"1.2":if(_.isUndefined(e))throw new Error("resourceListing is required");if(!_.isPlainObject(e))throw new TypeError("resourceListing must be an object");if(_.isUndefined(r))throw new Error("apiDeclarations is required");if(!_.isArray(r))throw new TypeError("apiDeclarations must be an array");break;case"2.0":if(_.isUndefined(e))throw new Error("swaggerObject is required");if(!_.isPlainObject(e))throw new TypeError("swaggerObject must be an object")}if("2.0"===this.version&&(n=arguments[1]),_.isUndefined(n))throw new Error("callback is required");if(!_.isFunction(n))throw new TypeError("callback must be a function");"2.0"===this.version&&(r=[]),validateStructurally(this,e,r,function(i,t){i||helpers.formatResults(t)?n(i,t):validateSemantically(this,e,r,n)}.bind(this))},Specification.prototype.composeModel=function(e,r,n){var i=helpers.getSwaggerVersion(e),t=function(i,t){var o;return i?n(i):helpers.getErrorCount(t)>0?handleValidationError(t,n):(o=getDocumentCache(e),t={errors:[],warnings:[]},processDocument(o,t),o.definitions[r]?helpers.getErrorCount(t)>0?handleValidationError(t,n):void n(void 0,getOrComposeSchema(o,r)):n())};switch(this.version){case"1.2":if(_.isUndefined(e))throw new Error("apiDeclaration is required");if(!_.isPlainObject(e))throw new TypeError("apiDeclaration must be an object");if(_.isUndefined(r))throw new Error("modelId is required");break;case"2.0":if(_.isUndefined(e))throw new Error("swaggerObject is required");if(!_.isPlainObject(e))throw new TypeError("swaggerObject must be an object");if(_.isUndefined(r))throw new Error("modelRef is required")}if(_.isUndefined(n))throw new Error("callback is required");if(!_.isFunction(n))throw new TypeError("callback must be a function");if("#"!==r.charAt(0)){if("1.2"!==this.version)throw new Error("modelRef must be a JSON Pointer");r="#/models/"+r}"1.2"===i?validateAgainstSchema(this,"apiDeclaration.json",e,t):this.validate(e,t)},Specification.prototype.validateModel=function(e,r,n,i){switch(this.version){case"1.2":if(_.isUndefined(e))throw new Error("apiDeclaration is required");if(!_.isPlainObject(e))throw new TypeError("apiDeclaration must be an object");if(_.isUndefined(r))throw new Error("modelId is required");break;case"2.0":if(_.isUndefined(e))throw new Error("swaggerObject is required");if(!_.isPlainObject(e))throw new TypeError("swaggerObject must be an object");if(_.isUndefined(r))throw new Error("modelRef is required")}if(_.isUndefined(n))throw new Error("data is required");if(_.isUndefined(i))throw new Error("callback is required");if(!_.isFunction(i))throw new TypeError("callback must be a function");this.composeModel(e,r,function(e,r){return e?i(e):void validateAgainstSchema(this,r,n,i)}.bind(this))},Specification.prototype.resolve=function(e,r,n){var i,t,o=function(e){return _.isString(r)?n(void 0,traverse(e).get(JsonRefs.pathFromPointer(r))):n(void 0,e)};if(_.isUndefined(e))throw new Error("document is required");if(!_.isPlainObject(e))throw new TypeError("document must be an object");if(2===arguments.length&&(n=arguments[1],r=void 0),!_.isUndefined(r)&&!_.isString(r))throw new TypeError("ptr must be a JSON Pointer string");if(_.isUndefined(n))throw new Error("callback is required");if(!_.isFunction(n))throw new TypeError("callback must be a function");if(i=getDocumentCache(e),"1.2"===i.swaggerVersion)throw new Error("Swagger 1.2 is not supported");return i.resolved?o(i.resolved):(t="1.2"===i.swaggerVersion?_.find(["basePath","consumes","models","produces","resourcePath"],function(r){return!_.isUndefined(e[r])})?"apiDeclaration.json":"resourceListing.json":"schema.json",void this.validate(e,function(e,r){return e?n(e):helpers.getErrorCount(r)>0?handleValidationError(r,n):o(i.resolved)}))},Specification.prototype.convert=function(e,r,n,i){var t=function(e,r){i(void 0,swaggerConverter(e,r))}.bind(this);if("1.2"!==this.version)throw new Error("Specification#convert only works for Swagger 1.2");if(_.isUndefined(e))throw new Error("resourceListing is required");if(!_.isPlainObject(e))throw new TypeError("resourceListing must be an object");if(_.isUndefined(r)&&(r=[]),!_.isArray(r))throw new TypeError("apiDeclarations must be an array");if(arguments.length<4&&(i=arguments[arguments.length-1]),_.isUndefined(i))throw new Error("callback is required");if(!_.isFunction(i))throw new TypeError("callback must be a function");n===!0?t(e,r):this.validate(e,r,function(n,o){return n?i(n):helpers.getErrorCount(o)>0?handleValidationError(o,i):void t(e,r)})},module.exports.v1=module.exports.v1_2=new Specification("1.2"),module.exports.v2=module.exports.v2_0=new Specification("2.0");
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../schemas/1.2/apiDeclaration.json":5,"../schemas/1.2/authorizationObject.json":6,"../schemas/1.2/dataType.json":7,"../schemas/1.2/dataTypeBase.json":8,"../schemas/1.2/infoObject.json":9,"../schemas/1.2/modelsObject.json":10,"../schemas/1.2/oauth2GrantType.json":11,"../schemas/1.2/operationObject.json":12,"../schemas/1.2/parameterObject.json":13,"../schemas/1.2/resourceListing.json":14,"../schemas/1.2/resourceObject.json":15,"../schemas/2.0/schema.json":16,"./helpers":2,"./validators":3}],2:[function(require,module,exports){
(function (process){
"use strict";var _=window._,JsonRefs=window.JsonRefs,ZSchema=window.ZSchema,draft04Json=require("../schemas/json-schema-draft-04.json"),draft04Url="http://json-schema.org/draft-04/schema",specCache={};module.exports.createJsonValidator=function(r){var e,n=new ZSchema({reportPathAsArray:!0});if(n.setRemoteReference(draft04Url,draft04Json),_.each(["byte","double","float","int32","int64","mime-type","uri-template"],function(r){ZSchema.registerFormat(r,function(){return!0})}),!_.isUndefined(r)&&(e=n.compileSchema(r),e===!1))throw console.error("JSON Schema file"+(r.length>1?"s are":" is")+" invalid:"),_.each(n.getLastErrors(),function(r){console.error("  "+(_.isArray(r.path)?JsonRefs.pathToPointer(r.path):r.path)+": "+r.message)}),new Error("Unable to create validator due to invalid JSON Schema");return n},module.exports.formatResults=function(r){return r?r.errors.length+r.warnings.length+_.reduce(r.apiDeclarations,function(r,e){return e&&(r+=e.errors.length+e.warnings.length),r},0)>0?r:void 0:r},module.exports.getErrorCount=function(r){var e=0;return r&&(e=r.errors.length,_.each(r.apiDeclarations,function(r){r&&(e+=r.errors.length)})),e};var coerseVersion=function(r){return r&&!_.isString(r)&&(r=r.toString(),-1===r.indexOf(".")&&(r+=".0")),r};module.exports.getSpec=function(r,e){var n;if(r=coerseVersion(r),n=specCache[r],_.isUndefined(n))switch(r){case"1.2":n=require("../lib/specs").v1_2;break;case"2.0":n=require("../lib/specs").v2_0;break;default:if(e===!0)throw new Error("Unsupported Swagger version: "+r)}return n},module.exports.getSwaggerVersion=function(r){return _.isPlainObject(r)?coerseVersion(r.swaggerVersion||r.swagger):void 0};var toJsonPointer=module.exports.toJsonPointer=function(r){return"#/"+r.map(function(r){return r.replace(/~/g,"~0").replace(/\//g,"~1")}).join("/")};module.exports.printValidationResults=function(r,e,n,o,t,s){var a=function(r,e){return 1===e?r:r+"s"},i=function u(r,e,n){r&&(console.error(r+":"),console.error()),_.each(e,function(r){console.error(new Array(n+1).join(" ")+toJsonPointer(r.path)+": "+r.message),r.inner&&u(void 0,r.inner,n+2)}),r&&console.error()},c=0,l=0;console.error(),o.errors.length>0&&(c+=o.errors.length,i("API Errors",o.errors,2)),o.warnings.length>0&&(l+=o.warnings.length,i("API Warnings",o.warnings,2)),o.apiDeclarations&&o.apiDeclarations.forEach(function(r,e){if(r){var o=n[e].resourcePath||e;r.errors.length>0&&(c+=r.errors.length,i("  API Declaration ("+o+") Errors",r.errors,4)),r.warnings.length>0&&(l+=r.warnings.length,i("  API Declaration ("+o+") Warnings",r.warnings,4))}}),t&&console.error(c>0?c+" "+a("error",c)+" and "+l+" "+a("warning",l):"Validation succeeded but with "+l+" "+a("warning",l)),c>0&&s&&process.exit(1)},module.exports.swaggerOperationMethods=["DELETE","GET","HEAD","OPTIONS","PATCH","POST","PUT"];


}).call(this,require('_process'))
},{"../lib/specs":undefined,"../schemas/json-schema-draft-04.json":17,"_process":4}],3:[function(require,module,exports){
"use strict";var _=window._,helpers=require("./helpers"),dateRegExp=/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/,dateTimeRegExp=/^([0-9]{2}):([0-9]{2}):([0-9]{2})(.[0-9]+)?(z|([+-][0-9]{2}:[0-9]{2}))$/,isValidDate=function(e){var t,i,a;return _.isString(e)||(e=e.toString()),i=dateRegExp.exec(e),null===i?!1:(t=i[3],a=i[2],"01">a||a>"12"||"01">t||t>"31"?!1:!0)},isValidDateTime=function(e){var t,i,a,r,n,o,d;return _.isString(e)||(e=e.toString()),o=e.toLowerCase().split("t"),i=o[0],a=o.length>1?o[1]:void 0,isValidDate(i)?(r=dateTimeRegExp.exec(a),null===r?!1:(t=r[1],n=r[2],d=r[3],t>"23"||n>"59"||d>"59"?!1:!0)):!1},throwErrorWithCode=function(e,t){var i=new Error(t);throw i.code=e,i.failedValidation=!0,i};module.exports.validateAgainstSchema=function(e,t,i){var a=function(e){delete e.params,e.inner&&_.each(e.inner,function(e){a(e)})},r=_.isPlainObject(e)?_.cloneDeep(e):e;_.isUndefined(i)&&(i=helpers.createJsonValidator([r]));var n=i.validate(t,r);if(!n)try{throwErrorWithCode("SCHEMA_VALIDATION_FAILED","Failed schema validation")}catch(o){throw o.results={errors:_.map(i.getLastErrors(),function(e){return a(e),e}),warnings:[]},o}};var validateArrayType=module.exports.validateArrayType=function(e){"array"===e.type&&_.isUndefined(e.items)&&throwErrorWithCode("OBJECT_MISSING_REQUIRED_PROPERTY","Missing required property: items")};module.exports.validateContentType=function(e,t,i){var a="function"==typeof i.end,r=a?i.getHeader("content-type"):i.headers["content-type"],n=_.union(e,t);if(r||(r=a?"text/plain":"application/octet-stream"),r=r.split(";")[0],n.length>0&&(a?!0:-1!==["POST","PUT"].indexOf(i.method))&&-1===n.indexOf(r))throw new Error("Invalid content type ("+r+").  These are valid: "+n.join(", "))};var validateEnum=module.exports.validateEnum=function(e,t){_.isUndefined(t)||_.isUndefined(e)||-1!==t.indexOf(e)||throwErrorWithCode("ENUM_MISMATCH","Not an allowable value ("+t.join(", ")+"): "+e)},validateMaximum=module.exports.validateMaximum=function(e,t,i,a){var r,n,o=a===!0?"MAXIMUM_EXCLUSIVE":"MAXIMUM";_.isUndefined(a)&&(a=!1),"integer"===i?n=parseInt(e,10):"number"===i&&(n=parseFloat(e)),_.isUndefined(t)||(r=parseFloat(t),a&&n>=r?throwErrorWithCode(o,"Greater than or equal to the configured maximum ("+t+"): "+e):n>r&&throwErrorWithCode(o,"Greater than the configured maximum ("+t+"): "+e))},validateMaxItems=module.exports.validateMaxItems=function(e,t){!_.isUndefined(t)&&e.length>t&&throwErrorWithCode("ARRAY_LENGTH_LONG","Array is too long ("+e.length+"), maximum "+t)},validateMaxLength=module.exports.validateMaxLength=function(e,t){!_.isUndefined(t)&&e.length>t&&throwErrorWithCode("MAX_LENGTH","String is too long ("+e.length+" chars), maximum "+t)},validateMaxProperties=module.exports.validateMaxProperties=function(e,t){var i=_.isPlainObject(e)?Object.keys(e).length:0;!_.isUndefined(t)&&i>t&&throwErrorWithCode("MAX_PROPERTIES","Number of properties is too many ("+i+" properties), maximum "+t)},validateMinimum=module.exports.validateMinimum=function(e,t,i,a){var r,n,o=a===!0?"MINIMUM_EXCLUSIVE":"MINIMUM";_.isUndefined(a)&&(a=!1),"integer"===i?n=parseInt(e,10):"number"===i&&(n=parseFloat(e)),_.isUndefined(t)||(r=parseFloat(t),a&&r>=n?throwErrorWithCode(o,"Less than or equal to the configured minimum ("+t+"): "+e):r>n&&throwErrorWithCode(o,"Less than the configured minimum ("+t+"): "+e))},validateMinItems=module.exports.validateMinItems=function(e,t){!_.isUndefined(t)&&e.length<t&&throwErrorWithCode("ARRAY_LENGTH_SHORT","Array is too short ("+e.length+"), minimum "+t)},validateMinLength=module.exports.validateMinLength=function(e,t){!_.isUndefined(t)&&e.length<t&&throwErrorWithCode("MIN_LENGTH","String is too short ("+e.length+" chars), minimum "+t)},validateMinProperties=module.exports.validateMinProperties=function(e,t){var i=_.isPlainObject(e)?Object.keys(e).length:0;!_.isUndefined(t)&&t>i&&throwErrorWithCode("MIN_PROPERTIES","Number of properties is too few ("+i+" properties), minimum "+t)},validateMultipleOf=module.exports.validateMultipleOf=function(e,t){_.isUndefined(t)||e%t===0||throwErrorWithCode("MULTIPLE_OF","Not a multiple of "+t)},validatePattern=module.exports.validatePattern=function(e,t){!_.isUndefined(t)&&_.isNull(e.match(new RegExp(t)))&&throwErrorWithCode("PATTERN","Does not match required pattern: "+t)};module.exports.validateRequiredness=function(e,t){!_.isUndefined(t)&&t===!0&&_.isUndefined(e)&&throwErrorWithCode("REQUIRED","Is required")};var validateTypeAndFormat=module.exports.validateTypeAndFormat=function e(t,i,a,r){var n=!0;if(_.isArray(t))_.each(t,function(t,r){e(t,i,a,!0)||throwErrorWithCode("INVALID_TYPE","Value at index "+r+" is not a valid "+i+": "+t)});else switch(i){case"boolean":n=_.isBoolean(t)||-1!==["false","true"].indexOf(t);break;case"integer":n=!_.isNaN(parseInt(t,10));break;case"number":n=!_.isNaN(parseFloat(t));break;case"string":if(!_.isUndefined(a))switch(a){case"date":n=isValidDate(t);break;case"date-time":n=isValidDateTime(t)}break;case"void":n=_.isUndefined(t)}return r?n:void(n||throwErrorWithCode("INVALID_TYPE","void"!==i?"Not a valid "+(_.isUndefined(a)?"":a+" ")+i+": "+t:"Void does not allow a value"))},validateUniqueItems=module.exports.validateUniqueItems=function(e,t){_.isUndefined(t)||_.uniq(e).length===e.length||throwErrorWithCode("ARRAY_UNIQUE","Does not allow duplicate values: "+e.join(", "))};module.exports.validateSchemaConstraints=function(e,t,i,a){var r=function d(e){var t=e;return t.schema&&(i=i.concat(["schema"]),t=d(t.schema)),t},n=t.type;n||(t.schema?(t=r(t),n=t.type||"object"):n="responses"===i[i.length-2]?"void":"object");try{if("array"===n&&validateArrayType(t),_.isUndefined(a)&&(a="1.2"===e?t.defaultValue:t["default"],i=i.concat(["1.2"===e?"defaultValue":"default"])),_.isUndefined(a))return;"array"===n?_.isUndefined(t.items)?validateTypeAndFormat(a,n,t.format):validateTypeAndFormat(a,"array"===n?t.items.type:n,"array"===n&&t.items.format?t.items.format:t.format):validateTypeAndFormat(a,n,t.format),validateEnum(a,t["enum"]),validateMaximum(a,t.maximum,n,t.exclusiveMaximum),validateMaxItems(a,t.maxItems),validateMaxLength(a,t.maxLength),validateMaxProperties(a,t.maxProperties),validateMinimum(a,t.minimum,n,t.exclusiveMinimum),validateMinItems(a,t.minItems),validateMinLength(a,t.minLength),validateMinProperties(a,t.minProperties),validateMultipleOf(a,t.multipleOf),validatePattern(a,t.pattern),validateUniqueItems(a,t.uniqueItems)}catch(o){throw o.path=i,o}};


},{"./helpers":2}],4:[function(require,module,exports){
function drainQueue(){if(!draining){draining=!0;for(var e,o=queue.length;o;){e=queue,queue=[];for(var r=-1;++r<o;)e[r]();o=queue.length}draining=!1}}function noop(){}var process=module.exports={},queue=[],draining=!1;process.nextTick=function(e){queue.push(e),draining||setTimeout(drainQueue,0)},process.title="browser",process.browser=!0,process.env={},process.argv=[],process.version="",process.versions={},process.on=noop,process.addListener=noop,process.once=noop,process.off=noop,process.removeListener=noop,process.removeAllListeners=noop,process.emit=noop,process.binding=function(e){throw new Error("process.binding is not supported")},process.cwd=function(){return"/"},process.chdir=function(e){throw new Error("process.chdir is not supported")},process.umask=function(){return 0};


},{}],5:[function(require,module,exports){
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

},{}],6:[function(require,module,exports){
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


},{}],7:[function(require,module,exports){
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
},{}],8:[function(require,module,exports){
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

},{}],9:[function(require,module,exports){
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
},{}],10:[function(require,module,exports){
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


},{}],11:[function(require,module,exports){
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
},{}],12:[function(require,module,exports){
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

},{}],13:[function(require,module,exports){
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

},{}],14:[function(require,module,exports){
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

},{}],15:[function(require,module,exports){
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
},{}],16:[function(require,module,exports){
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
},{}],17:[function(require,module,exports){
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

},{}]},{},[1])(1)
});