(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}(g.SwaggerTools || (g.SwaggerTools = {})).specs = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";var _={each:require("lodash-compat/collection/each"),indexOf:require("lodash-compat/array/indexOf"),isArray:require("lodash-compat/lang/isArray"),isPlainObject:require("lodash-compat/lang/isPlainObject"),isString:require("lodash-compat/lang/isString"),isUndefined:require("lodash-compat/lang/isUndefined"),reduce:require("lodash-compat/collection/reduce")},JsonRefs=require("json-refs"),traverse=require("traverse"),ZSchema=require("z-schema"),customJsonSchemaFormats=["byte","double","float","int32","int64","mime-type","uri-template"],draft04Json=require("../schemas/json-schema-draft-04.json"),draft04Url="http://json-schema.org/draft-04/schema",specCache={};module.exports.registerCustomFormats=function(e){traverse(e).forEach(function(){var e=this.key,r=this.node;"format"===e&&-1===_.indexOf(ZSchema.getRegisteredFormats(),r)&&ZSchema.registerFormat(r,function(){return!0})})},module.exports.createJsonValidator=function(e){var r,n=new ZSchema({reportPathAsArray:!0});if(n.setRemoteReference(draft04Url,draft04Json),_.each(customJsonSchemaFormats,function(e){ZSchema.registerFormat(e,function(){return!0})}),!_.isUndefined(e)&&(r=n.compileSchema(e),r===!1))throw console.error("JSON Schema file"+(e.length>1?"s are":" is")+" invalid:"),_.each(n.getLastErrors(),function(e){console.error("  "+(_.isArray(e.path)?JsonRefs.pathToPointer(e.path):e.path)+": "+e.message)}),new Error("Unable to create validator due to invalid JSON Schema");return n},module.exports.formatResults=function(e){return e&&(e=e.errors.length+e.warnings.length+_.reduce(e.apiDeclarations,function(e,r){return r&&(e+=r.errors.length+r.warnings.length),e},0)>0?e:void 0),e};var getErrorCount=module.exports.getErrorCount=function(e){var r=0;return e&&(r=e.errors.length,_.each(e.apiDeclarations,function(e){e&&(r+=e.errors.length)})),r},coerceVersion=function(e){return e&&!_.isString(e)&&(e=e.toString(),-1===e.indexOf(".")&&(e+=".0")),e};module.exports.getSpec=function(e,r){var n;if(e=coerceVersion(e),n=specCache[e],_.isUndefined(n))switch(e){case"1.2":n=require("../lib/specs").v1_2;break;case"2.0":n=require("../lib/specs").v2_0;break;default:if(r===!0)throw new Error("Unsupported Swagger version: "+e)}return n},module.exports.getSwaggerVersion=function(e){return _.isPlainObject(e)?coerceVersion(e.swaggerVersion||e.swagger):void 0},module.exports.printValidationResults=function(e,r,n,t,o){var a=getErrorCount(t)>0,s=a?console.error:console.log,i=function(e,r){return 1===r?e:e+"s"},c=function h(e,r,n){e&&(s(e+":"),s()),_.each(r,function(e){s(new Array(n+1).join(" ")+JsonRefs.pathToPointer(e.path)+": "+e.message),e.inner&&h(void 0,e.inner,n+2)}),e&&s()},l=0,u=0;s(),t.errors.length>0&&(l+=t.errors.length,c("API Errors",t.errors,2)),t.warnings.length>0&&(u+=t.warnings.length,c("API Warnings",t.warnings,2)),t.apiDeclarations&&t.apiDeclarations.forEach(function(e,r){if(e){var t=n[r].resourcePath||r;e.errors.length>0&&(l+=e.errors.length,c("  API Declaration ("+t+") Errors",e.errors,4)),e.warnings.length>0&&(u+=e.warnings.length,c("  API Declaration ("+t+") Warnings",e.warnings,4))}}),o&&s(l>0?l+" "+i("error",l)+" and "+u+" "+i("warning",u):"Validation succeeded but with "+u+" "+i("warning",u)),s()},module.exports.swaggerOperationMethods=["DELETE","GET","HEAD","OPTIONS","PATCH","POST","PUT"];

},{"../lib/specs":2,"../schemas/json-schema-draft-04.json":230,"json-refs":43,"lodash-compat/array/indexOf":50,"lodash-compat/collection/each":55,"lodash-compat/collection/reduce":59,"lodash-compat/lang/isArray":131,"lodash-compat/lang/isPlainObject":141,"lodash-compat/lang/isString":142,"lodash-compat/lang/isUndefined":144,"traverse":204,"z-schema":215}],2:[function(require,module,exports){
(function (global){
"use strict";var _={cloneDeep:require("lodash-compat/lang/cloneDeep"),difference:require("lodash-compat/array/difference"),each:require("lodash-compat/collection/each"),find:require("lodash-compat/collection/find"),has:require("lodash-compat/object/has"),isArray:require("lodash-compat/lang/isArray"),isFunction:require("lodash-compat/lang/isFunction"),isPlainObject:require("lodash-compat/lang/isPlainObject"),isString:require("lodash-compat/lang/isString"),isUndefined:require("lodash-compat/lang/isUndefined"),map:require("lodash-compat/collection/map"),reduce:require("lodash-compat/collection/reduce"),union:require("lodash-compat/array/union")},async=require("async"),helpers=require("./helpers"),JsonRefs=require("json-refs"),SparkMD5=require("spark-md5"),swaggerConverter=require("swagger-converter"),traverse=require("traverse"),validators=require("./validators"),YAML=require("js-yaml");_.isPlainObject(swaggerConverter)&&(swaggerConverter=global.SwaggerConverter.convert);var documentCache={},validOptionNames=_.map(helpers.swaggerOperationMethods,function(e){return e.toLowerCase()}),addExternalRefsToValidator=function e(r,n,i){var t=_.reduce(JsonRefs.findRefs(n),function(e,r,n){return JsonRefs.isRemotePointer(n)&&e.push(r.split("#")[0]),e},[]),o=function(n,i){JsonRefs.resolveRefs({$ref:n},function(n,t){return n?i(n):void e(r,t,function(e,r){i(e,r)})})};t.length>0?async.map(t,o,function(e,n){return e?i(e):(_.each(n,function(e,n){r.setRemoteReference(t[n],e),helpers.registerCustomFormats(r,e)}),void i())}):(helpers.registerCustomFormats(n),i())},createErrorOrWarning=function(e,r,n,i){i.push({code:e,message:r,path:n})},addReference=function(e,r,n,i,t){var o,a,s,c,d,u=!0,f=helpers.getSwaggerVersion(e.resolved),h=_.isArray(r)?r:JsonRefs.pathFromPointer(r),p=_.isArray(r)?JsonRefs.pathToPointer(r):r,l=_.isArray(n)?n:JsonRefs.pathFromPointer(n),g=_.isArray(n)?JsonRefs.pathToPointer(n):n;return a=e.definitions[p],d=h[0],o="securityDefinitions"===d?"SECURITY_DEFINITION":d.substring(0,d.length-1).toUpperCase(),s="1.2"===f?h[h.length-1]:p,c="securityDefinitions"===d?"Security definition":o.charAt(0)+o.substring(1).toLowerCase(),["authorizations","securityDefinitions"].indexOf(h[0])>-1&&"scopes"===h[2]&&(o+="_SCOPE",c+=" scope"),_.isUndefined(a)?(t||createErrorOrWarning("UNRESOLVABLE_"+o,c+" could not be resolved: "+s,l,i.errors),u=!1):(_.isUndefined(a.references)&&(a.references=[]),a.references.push(g)),u},getOrComposeSchema=function r(e,n){var i,t,o="Composed "+("1.2"===e.swaggerVersion?JsonRefs.pathFromPointer(n).pop():n),a=e.definitions[n],s=traverse(e.original),c=traverse(e.resolved);return a?(t=_.cloneDeep(s.get(JsonRefs.pathFromPointer(n))),i=_.cloneDeep(c.get(JsonRefs.pathFromPointer(n))),"1.2"===e.swaggerVersion&&(a.lineage.length>0&&(i.allOf=[],_.each(a.lineage,function(n){i.allOf.push(r(e,n))})),delete i.subTypes,_.each(i.properties,function(n,i){var o=t.properties[i];_.each(["maximum","minimum"],function(e){_.isString(n[e])&&(n[e]=parseFloat(n[e]))}),_.each(JsonRefs.findRefs(o),function(i,t){var o="#/models/"+i,a=e.definitions[o],s=JsonRefs.pathFromPointer(t);a.lineage.length>0?traverse(n).set(s.slice(0,s.length-1),r(e,o)):traverse(n).set(s.slice(0,s.length-1).concat("title"),"Composed "+i)})})),i=traverse(i).map(function(e){"id"===this.key&&_.isString(e)&&this.remove()}),i.title=o,i):void 0},createUnusedErrorOrWarning=function(e,r,n,i,t){createErrorOrWarning("UNUSED_"+r,n+" is defined but is not used: "+e,i,t)},getDocumentCache=function(e){var r=SparkMD5.hash(JSON.stringify(e)),n=documentCache[r]||_.find(documentCache,function(e){return e.resolvedId===r});return n||(n=documentCache[r]={definitions:{},original:e,resolved:void 0,swaggerVersion:helpers.getSwaggerVersion(e)}),n},handleValidationError=function(e,r){var n=new Error("The Swagger document(s) are invalid");n.errors=e.errors,n.failedValidation=!0,n.warnings=e.warnings,e.apiDeclarations&&(n.apiDeclarations=e.apiDeclarations),r(n)},normalizePath=function(e){var r=e.match(/\{(.*?)\}/g),n=[],i=e;return r&&_.each(r,function(e,r){i=i.replace(e,"{"+r+"}"),n.push(e.replace(/[{}]/g,""))}),{path:i,args:n}},validateNoExist=function(e,r,n,i,t,o){!_.isUndefined(e)&&e.indexOf(r)>-1&&createErrorOrWarning("DUPLICATE_"+n,i+" already defined: "+r,t,o)},validateSchemaConstraints=function(e,r,n,i,t){try{validators.validateSchemaConstraints(e.swaggerVersion,r,n,void 0)}catch(o){t||createErrorOrWarning(o.code,o.message,o.path,i.errors)}},processDocument=function(e,r){var n=e.swaggerVersion,i=function(r,n){var i=JsonRefs.pathToPointer(r),t=e.definitions[i];return t||(t=e.definitions[i]={inline:n||!1,references:[]},["definitions","models"].indexOf(JsonRefs.pathFromPointer(i)[0])>-1&&(t.cyclical=!1,t.lineage=void 0,t.parents=[])),t},t=function(e){return"1.2"===n?JsonRefs.pathFromPointer(e).pop():e},o=function c(r,n,i){var t=e.definitions[n||r];t&&_.each(t.parents,function(e){i.push(e),r!==e&&c(r,e,i)})},a="1.2"===n?"authorizations":"securityDefinitions",s="1.2"===n?"models":"definitions";switch(_.each(e.resolved[a],function(e,t){var o=[a,t];("1.2"!==n||e.type)&&(i(o),_.reduce(e.scopes,function(e,t,a){var s="1.2"===n?t.scope:a,c=o.concat(["scopes",a.toString()]),d=i(o.concat(["scopes",s]));return d.scopePath=c,validateNoExist(e,s,"AUTHORIZATION_SCOPE_DEFINITION","Authorization scope definition","1.2"===n?c.concat("scope"):c,r.warnings),e.push(s),e},[]))}),_.each(e.resolved[s],function(t,o){var a=[s,o],c=i(a);if("1.2"===n&&o!==t.id&&createErrorOrWarning("MODEL_ID_MISMATCH","Model id does not match id in models object: "+t.id,a.concat("id"),r.errors),_.isUndefined(c.lineage))switch(n){case"1.2":_.each(t.subTypes,function(n,t){var o=["models",n],c=JsonRefs.pathToPointer(o),d=e.definitions[c],u=a.concat(["subTypes",t.toString()]);!d&&e.resolved[s][n]&&(d=i(o)),addReference(e,o,u,r)&&d.parents.push(JsonRefs.pathToPointer(a))});break;default:_.each(e.original[s][o].allOf,function(r,n){var t,o=!1;_.isUndefined(r.$ref)||JsonRefs.isRemotePointer(r.$ref)?(o=!0,t=a.concat(["allOf",n.toString()])):t=JsonRefs.pathFromPointer(r.$ref),_.isUndefined(traverse(e.resolved).get(t))||(i(t,o),c.parents.push(JsonRefs.pathToPointer(t)))})}}),n){case"2.0":_.each(e.resolved.parameters,function(n,t){var o=["parameters",t];i(o),validateSchemaConstraints(e,n,o,r)}),_.each(e.resolved.responses,function(n,t){var o=["responses",t];i(o),validateSchemaConstraints(e,n,o,r)})}_.each(e.definitions,function(i,a){var s,c,d,u=JsonRefs.pathFromPointer(a),f=traverse(e.original).get(u),h=u[0],p=h.substring(0,h.length-1).toUpperCase(),l=p.charAt(0)+p.substring(1).toLowerCase();-1!==["definitions","models"].indexOf(h)&&(s=[],c=[],d=i.lineage,_.isUndefined(d)&&(d=[],o(a,void 0,d),d.reverse(),i.lineage=_.cloneDeep(d),i.cyclical=d.length>1&&d[0]===a),i.parents.length>1&&"1.2"===n&&createErrorOrWarning("MULTIPLE_"+p+"_INHERITANCE","Child "+p.toLowerCase()+" is sub type of multiple models: "+_.map(i.parents,function(e){return t(e)}).join(" && "),u,r.errors),i.cyclical&&createErrorOrWarning("CYCLICAL_"+p+"_INHERITANCE",l+" has a circular inheritance: "+_.map(d,function(e){return t(e)}).join(" -> ")+" -> "+t(a),u.concat("1.2"===n?"subTypes":"allOf"),r.errors),_.each(d.slice(i.cyclical?1:0),function(r){var n=traverse(e.resolved).get(JsonRefs.pathFromPointer(r));_.each(Object.keys(n.properties||{}),function(e){-1===c.indexOf(e)&&c.push(e)})}),validateSchemaConstraints(e,f,u,r),_.each(f.properties,function(n,i){var t=u.concat(["properties",i]);_.isUndefined(n)||(validateSchemaConstraints(e,n,t,r),c.indexOf(i)>-1?createErrorOrWarning("CHILD_"+p+"_REDECLARES_PROPERTY","Child "+p.toLowerCase()+" declares property already declared by ancestor: "+i,t,r.errors):s.push(i))}),_.each(f.required||[],function(e,i){var t="1.2"===n?"Model":"Definition";-1===c.indexOf(e)&&-1===s.indexOf(e)&&createErrorOrWarning("MISSING_REQUIRED_"+t.toUpperCase()+"_PROPERTY",t+" requires property but it is not defined: "+e,u.concat(["required",i.toString()]),r.errors)}))}),_.each(JsonRefs.findRefs(e.original),function(n,i){"1.2"===e.swaggerVersion&&(n="#/models/"+n),JsonRefs.isRemotePointer(n)||addReference(e,n,i,r)}),_.each(e.referencesMetadata,function(e,n){JsonRefs.isRemotePointer(e.ref)&&!_.has(e,"value")&&r.errors.push({code:"UNRESOLVABLE_REFERENCE",message:"Reference could not be resolved: "+e.ref,path:JsonRefs.pathFromPointer(n)})})},validateExist=function(e,r,n,i,t,o){_.isUndefined(e)||-1!==e.indexOf(r)||createErrorOrWarning("UNRESOLVABLE_"+n,i+" could not be resolved: "+r,t,o)},processAuthRefs=function(e,r,n,i){var t="1.2"===e.swaggerVersion?"AUTHORIZATION":"SECURITY_DEFINITION",o="AUTHORIZATION"===t?"Authorization":"Security definition";"1.2"===e.swaggerVersion?_.reduce(r,function(r,a,s){var c=["authorizations",s],d=n.concat([s]);return addReference(e,c,d,i)&&_.reduce(a,function(r,n,a){var s=d.concat(a.toString(),"scope"),u=c.concat(["scopes",n.scope]);return validateNoExist(r,n.scope,t+"_SCOPE_REFERENCE",o+" scope reference",s,i.warnings),addReference(e,u,s,i),r.concat(n.scope)},[]),r.concat(s)},[]):_.reduce(r,function(r,a,s){return _.each(a,function(a,c){var d=["securityDefinitions",c],u=n.concat(s.toString(),c);validateNoExist(r,c,t+"_REFERENCE",o+" reference",u,i.warnings),r.push(c),addReference(e,d,u,i)&&_.each(a,function(r,n){var t=d.concat(["scopes",r]);addReference(e,t,u.concat(n.toString()),i)})}),r},[])},resolveRefs=function(e,r){var n,i=getDocumentCache(e),t=helpers.getSwaggerVersion(e);i.resolved?r():("1.2"===t&&(e=_.cloneDeep(e),n=traverse(e),_.each(JsonRefs.findRefs(e),function(e,r){n.set(JsonRefs.pathFromPointer(r),"#/models/"+e)})),JsonRefs.resolveRefs(e,{processContent:function(e){return YAML.safeLoad(e)}},function(e,n,t){return e?r(e):(i.referencesMetadata=t,i.resolved=n,i.resolvedId=SparkMD5.hash(JSON.stringify(n)),void r())}))},validateAgainstSchema=function(e,r,n,i){var t=_.isString(r)?e.validators[r]:helpers.createJsonValidator(),o=function(){try{validators.validateAgainstSchema(r,n,t)}catch(e){return e.failedValidation?i(void 0,e.results):i(e)}resolveRefs(n,function(e){return i(e)})};addExternalRefsToValidator(t,n,function(e){return e?i(e):(helpers.registerCustomFormats(n),void o())})},validateDefinitions=function(e,r){_.each(e.definitions,function(n,i){var t=JsonRefs.pathFromPointer(i),o=t[0].substring(0,t[0].length-1),a="1.2"===e.swaggerVersion?t[t.length-1]:i,s="securityDefinition"===o?"SECURITY_DEFINITION":o.toUpperCase(),c="securityDefinition"===o?"Security definition":o.charAt(0).toUpperCase()+o.substring(1);0!==n.references.length||n.inline||(n.scopePath&&(s+="_SCOPE",c+=" scope",t=n.scopePath),createUnusedErrorOrWarning(a,s,c,t,r.warnings))})},validateParameters=function(e,r,n,i,t,o,a){var s=function(r){createErrorOrWarning("INVALID_PARAMETER_COMBINATION","API cannot have a a body parameter and a "+("1.2"===e.version?"form":"formData")+" parameter",r,o.errors)},c=[],d=!1,u=!1;_.reduce(i,function(i,a,f){var h=t.concat(["parameters",f.toString()]);if(!_.isUndefined(a))return validateNoExist(i,a.name,"PARAMETER","Parameter",h.concat("name"),o.errors),"body"===a.paramType||"body"===a["in"]?(d===!0?createErrorOrWarning("DUPLICATE_API_BODY_PARAMETER","API has more than one body parameter",h,o.errors):u===!0&&s(h),d=!0):"form"===a.paramType||"formData"===a["in"]?(d===!0&&s(h),u=!0):("path"===a.paramType||"path"===a["in"])&&(-1===n.args.indexOf(a.name)&&createErrorOrWarning("UNRESOLVABLE_API_PATH_PARAMETER","API path parameter could not be resolved: "+a.name,h.concat("name"),o.errors),c.push(a.name)),-1===e.primitives.indexOf(a.type)&&"1.2"===e.version&&addReference(r,"#/models/"+a.type,h.concat("type"),o),validateSchemaConstraints(r,a,h,o,a.skipErrors),i.concat(a.name)},[]),(_.isUndefined(a)||a===!1)&&_.each(_.difference(n.args,c),function(e){createErrorOrWarning("MISSING_API_PATH_PARAMETER","API requires path parameter but it is not defined: "+e,"1.2"===r.swaggerVersion?t.slice(0,2).concat("path"):t,o.errors)})},validateSwagger1_2=function(e,r,n,i){var t=[],o=getDocumentCache(r),a=[],s={errors:[],warnings:[],apiDeclarations:[]};a=_.reduce(r.apis,function(e,r,n){return validateNoExist(e,r.path,"RESOURCE_PATH","Resource path",["apis",n.toString(),"path"],s.errors),e.push(r.path),e},[]),processDocument(o,s),t=_.reduce(n,function(r,n,i){var c=s.apiDeclarations[i]={errors:[],warnings:[]},d=getDocumentCache(n);return validateNoExist(r,n.resourcePath,"RESOURCE_PATH","Resource path",["resourcePath"],c.errors),-1===t.indexOf(n.resourcePath)&&(validateExist(a,n.resourcePath,"RESOURCE_PATH","Resource path",["resourcePath"],c.errors),r.push(n.resourcePath)),processDocument(d,c),_.reduce(n.apis,function(r,n,i){var t=["apis",i.toString()],a=normalizePath(n.path);return r.indexOf(a.path)>-1?createErrorOrWarning("DUPLICATE_API_PATH","API path (or equivalent) already defined: "+n.path,t.concat("path"),c.errors):r.push(a.path),_.reduce(n.operations,function(r,n,i){var s=t.concat(["operations",i.toString()]);return validateNoExist(r,n.method,"OPERATION_METHOD","Operation method",s.concat("method"),c.errors),r.push(n.method),-1===e.primitives.indexOf(n.type)&&"1.2"===e.version&&addReference(d,"#/models/"+n.type,s.concat("type"),c),processAuthRefs(o,n.authorizations,s.concat("authorizations"),c),validateSchemaConstraints(d,n,s,c),validateParameters(e,d,a,n.parameters,s,c),_.reduce(n.responseMessages,function(e,r,n){var i=s.concat(["responseMessages",n.toString()]);return validateNoExist(e,r.code,"RESPONSE_MESSAGE_CODE","Response message code",i.concat(["code"]),c.errors),r.responseModel&&addReference(d,"#/models/"+r.responseModel,i.concat("responseModel"),c),e.concat(r.code)},[]),r},[]),r},[]),validateDefinitions(d,c),r},[]),validateDefinitions(o,s),_.each(_.difference(a,t),function(e){var n=a.indexOf(e);createUnusedErrorOrWarning(r.apis[n].path,"RESOURCE_PATH","Resource path",["apis",n.toString(),"path"],s.errors)}),i(void 0,s)},validateSwagger2_0=function(e,r,n){var i=getDocumentCache(r),t={errors:[],warnings:[]};processDocument(i,t),processAuthRefs(i,r.security,["security"],t),_.reduce(i.resolved.paths,function(r,n,o){var a=["paths",o],s=normalizePath(o);return r.indexOf(s.path)>-1&&createErrorOrWarning("DUPLICATE_API_PATH","API path (or equivalent) already defined: "+o,a,t.errors),validateParameters(e,i,s,n.parameters,a,t,!0),_.each(n,function(r,o){var c=[],d=a.concat(o),u=[];-1!==validOptionNames.indexOf(o)&&(processAuthRefs(i,r.security,d.concat("security"),t),_.each(r.parameters,function(e){_.isUndefined(e)||(c.push(e),u.push(e.name+":"+e["in"]))}),_.each(n.parameters,function(e){var r=_.cloneDeep(e);r.skipErrors=!0,-1===u.indexOf(e.name+":"+e["in"])&&c.push(r)}),validateParameters(e,i,s,c,d,t),_.each(r.responses,function(e,r){_.isUndefined(e)||validateSchemaConstraints(i,e,d.concat("responses",r),t)}))}),r.concat(s.path)},[]),validateDefinitions(i,t),n(void 0,t)},validateSemantically=function(e,r,n,i){var t=function(e,r){i(e,helpers.formatResults(r))};"1.2"===e.version?validateSwagger1_2(e,r,n,t):validateSwagger2_0(e,r,t)},validateStructurally=function(e,r,n,i){validateAgainstSchema(e,"1.2"===e.version?"resourceListing.json":"schema.json",r,function(r,t){return r?i(r):void(t||"1.2"!==e.version?i(void 0,t):(t={errors:[],warnings:[],apiDeclarations:[]},async.map(n,function(r,n){validateAgainstSchema(e,"apiDeclaration.json",r,n)},function(e,r){return e?i(e):(_.each(r,function(e,r){t.apiDeclarations[r]=e}),void i(void 0,t))})))})},Specification=function(e){var r=function(e,r){return _.reduce(r,function(e,r,n){return e[n]=helpers.createJsonValidator(r),e}.bind(this),{})},n=function(e){var r=_.cloneDeep(this.schemas[e]);return r.id=e,r}.bind(this),i=["string","number","boolean","integer","array"];switch(e){case"1.2":this.docsUrl="https://github.com/swagger-api/swagger-spec/blob/master/versions/1.2.md",this.primitives=_.union(i,["void","File"]),this.schemasUrl="https://github.com/swagger-api/swagger-spec/tree/master/schemas/v1.2",this.schemas={"apiDeclaration.json":require("../schemas/1.2/apiDeclaration.json"),"authorizationObject.json":require("../schemas/1.2/authorizationObject.json"),"dataType.json":require("../schemas/1.2/dataType.json"),"dataTypeBase.json":require("../schemas/1.2/dataTypeBase.json"),"infoObject.json":require("../schemas/1.2/infoObject.json"),"modelsObject.json":require("../schemas/1.2/modelsObject.json"),"oauth2GrantType.json":require("../schemas/1.2/oauth2GrantType.json"),"operationObject.json":require("../schemas/1.2/operationObject.json"),"parameterObject.json":require("../schemas/1.2/parameterObject.json"),"resourceListing.json":require("../schemas/1.2/resourceListing.json"),"resourceObject.json":require("../schemas/1.2/resourceObject.json")},this.validators=r(this,{"apiDeclaration.json":_.map(["dataTypeBase.json","modelsObject.json","oauth2GrantType.json","authorizationObject.json","parameterObject.json","operationObject.json","apiDeclaration.json"],n),"resourceListing.json":_.map(["resourceObject.json","infoObject.json","oauth2GrantType.json","authorizationObject.json","resourceListing.json"],n)});break;case"2.0":this.docsUrl="https://github.com/swagger-api/swagger-spec/blob/master/versions/2.0.md",this.primitives=_.union(i,["file"]),this.schemasUrl="https://github.com/swagger-api/swagger-spec/tree/master/schemas/v2.0",this.schemas={"schema.json":require("../schemas/2.0/schema.json")},this.validators=r(this,{"schema.json":[n("schema.json")]});break;default:throw new Error(e+" is an unsupported Swagger specification version")}this.version=e};Specification.prototype.validate=function(e,r,n){switch(this.version){case"1.2":if(_.isUndefined(e))throw new Error("resourceListing is required");if(!_.isPlainObject(e))throw new TypeError("resourceListing must be an object");if(_.isUndefined(r))throw new Error("apiDeclarations is required");if(!_.isArray(r))throw new TypeError("apiDeclarations must be an array");break;case"2.0":if(_.isUndefined(e))throw new Error("swaggerObject is required");if(!_.isPlainObject(e))throw new TypeError("swaggerObject must be an object")}if("2.0"===this.version&&(n=arguments[1]),_.isUndefined(n))throw new Error("callback is required");if(!_.isFunction(n))throw new TypeError("callback must be a function");"2.0"===this.version&&(r=[]),validateStructurally(this,e,r,function(i,t){i||helpers.formatResults(t)?n(i,t):validateSemantically(this,e,r,n)}.bind(this))},Specification.prototype.composeModel=function(e,r,n){var i=helpers.getSwaggerVersion(e),t=function(i,t){var o;return i?n(i):helpers.getErrorCount(t)>0?handleValidationError(t,n):(o=getDocumentCache(e),t={errors:[],warnings:[]},processDocument(o,t),o.definitions[r]?helpers.getErrorCount(t)>0?handleValidationError(t,n):void n(void 0,getOrComposeSchema(o,r)):n())};switch(this.version){case"1.2":if(_.isUndefined(e))throw new Error("apiDeclaration is required");if(!_.isPlainObject(e))throw new TypeError("apiDeclaration must be an object");if(_.isUndefined(r))throw new Error("modelId is required");break;case"2.0":if(_.isUndefined(e))throw new Error("swaggerObject is required");if(!_.isPlainObject(e))throw new TypeError("swaggerObject must be an object");if(_.isUndefined(r))throw new Error("modelRef is required")}if(_.isUndefined(n))throw new Error("callback is required");if(!_.isFunction(n))throw new TypeError("callback must be a function");if("#"!==r.charAt(0)){if("1.2"!==this.version)throw new Error("modelRef must be a JSON Pointer");r="#/models/"+r}"1.2"===i?validateAgainstSchema(this,"apiDeclaration.json",e,t):this.validate(e,t)},Specification.prototype.validateModel=function(e,r,n,i){switch(this.version){case"1.2":if(_.isUndefined(e))throw new Error("apiDeclaration is required");if(!_.isPlainObject(e))throw new TypeError("apiDeclaration must be an object");if(_.isUndefined(r))throw new Error("modelId is required");break;case"2.0":if(_.isUndefined(e))throw new Error("swaggerObject is required");if(!_.isPlainObject(e))throw new TypeError("swaggerObject must be an object");if(_.isUndefined(r))throw new Error("modelRef is required")}if(_.isUndefined(n))throw new Error("data is required");if(_.isUndefined(i))throw new Error("callback is required");if(!_.isFunction(i))throw new TypeError("callback must be a function");this.composeModel(e,r,function(e,r){return e?i(e):void validateAgainstSchema(this,r,n,i)}.bind(this))},Specification.prototype.resolve=function(e,r,n){var i,t=function(e){return _.isString(r)?n(void 0,traverse(e).get(JsonRefs.pathFromPointer(r))):n(void 0,e)};if(_.isUndefined(e))throw new Error("document is required");if(!_.isPlainObject(e))throw new TypeError("document must be an object");if(2===arguments.length&&(n=arguments[1],r=void 0),!_.isUndefined(r)&&!_.isString(r))throw new TypeError("ptr must be a JSON Pointer string");if(_.isUndefined(n))throw new Error("callback is required");if(!_.isFunction(n))throw new TypeError("callback must be a function");if(i=getDocumentCache(e),"1.2"===i.swaggerVersion)throw new Error("Swagger 1.2 is not supported");return i.resolved?t(i.resolved):void this.validate(e,function(e,r){return e?n(e):helpers.getErrorCount(r)>0?handleValidationError(r,n):t(i.resolved)})},Specification.prototype.convert=function(e,r,n,i){var t=function(e,r){i(void 0,swaggerConverter(e,r))}.bind(this);if("1.2"!==this.version)throw new Error("Specification#convert only works for Swagger 1.2");if(_.isUndefined(e))throw new Error("resourceListing is required");if(!_.isPlainObject(e))throw new TypeError("resourceListing must be an object");if(_.isUndefined(r)&&(r=[]),!_.isArray(r))throw new TypeError("apiDeclarations must be an array");if(arguments.length<4&&(i=arguments[arguments.length-1]),_.isUndefined(i))throw new Error("callback is required");if(!_.isFunction(i))throw new TypeError("callback must be a function");n===!0?t(e,r):this.validate(e,r,function(n,o){return n?i(n):helpers.getErrorCount(o)>0?handleValidationError(o,i):void t(e,r)})},module.exports.v1=module.exports.v1_2=new Specification("1.2"),module.exports.v2=module.exports.v2_0=new Specification("2.0");
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../schemas/1.2/apiDeclaration.json":218,"../schemas/1.2/authorizationObject.json":219,"../schemas/1.2/dataType.json":220,"../schemas/1.2/dataTypeBase.json":221,"../schemas/1.2/infoObject.json":222,"../schemas/1.2/modelsObject.json":223,"../schemas/1.2/oauth2GrantType.json":224,"../schemas/1.2/operationObject.json":225,"../schemas/1.2/parameterObject.json":226,"../schemas/1.2/resourceListing.json":227,"../schemas/1.2/resourceObject.json":228,"../schemas/2.0/schema.json":229,"./helpers":1,"./validators":3,"async":4,"js-yaml":12,"json-refs":43,"lodash-compat/array/difference":49,"lodash-compat/array/union":53,"lodash-compat/collection/each":55,"lodash-compat/collection/find":56,"lodash-compat/collection/map":58,"lodash-compat/collection/reduce":59,"lodash-compat/lang/cloneDeep":129,"lodash-compat/lang/isArray":131,"lodash-compat/lang/isFunction":136,"lodash-compat/lang/isPlainObject":141,"lodash-compat/lang/isString":142,"lodash-compat/lang/isUndefined":144,"lodash-compat/object/has":145,"spark-md5":153,"swagger-converter":157,"traverse":204}],3:[function(require,module,exports){
"use strict";var _={cloneDeep:require("lodash-compat/lang/cloneDeep"),each:require("lodash-compat/collection/each"),isArray:require("lodash-compat/lang/isArray"),isBoolean:require("lodash-compat/lang/isBoolean"),isDate:require("lodash-compat/lang/isDate"),isFinite:require("lodash-compat/lang/isFinite"),isNull:require("lodash-compat/lang/isNull"),isNumber:require("lodash-compat/lang/isNumber"),isPlainObject:require("lodash-compat/lang/isPlainObject"),isString:require("lodash-compat/lang/isString"),isUndefined:require("lodash-compat/lang/isUndefined"),map:require("lodash-compat/collection/map"),union:require("lodash-compat/array/union"),uniq:require("lodash-compat/array/uniq")},helpers=require("./helpers"),dateRegExp=/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/,dateTimeRegExp=/^([0-9]{2}):([0-9]{2}):([0-9]{2})(.[0-9]+)?(z|([+-][0-9]{2}:[0-9]{2}))$/,isValidDate=function(e){var t,i,a;return _.isDate(e)?!0:(_.isString(e)||(e=e.toString()),i=dateRegExp.exec(e),null===i?!1:(t=i[3],a=i[2],"01">a||a>"12"||"01">t||t>"31"?!1:!0))},isValidDateTime=function(e){var t,i,a,r,n,o,d;return _.isDate(e)?!0:(_.isString(e)||(e=e.toString()),o=e.toLowerCase().split("t"),i=o[0],a=o.length>1?o[1]:void 0,isValidDate(i)?(r=dateTimeRegExp.exec(a),null===r?!1:(t=r[1],n=r[2],d=r[3],t>"23"||n>"59"||d>"59"?!1:!0)):!1)},throwErrorWithCode=function(e,t){var i=new Error(t);throw i.code=e,i.failedValidation=!0,i};module.exports.validateAgainstSchema=function(e,t,i){var a=function(e){delete e.params,e.inner&&_.each(e.inner,function(e){a(e)})},r=_.isPlainObject(e)?_.cloneDeep(e):e;_.isUndefined(i)&&(i=helpers.createJsonValidator([r]));var n=i.validate(t,r);if(!n)try{throwErrorWithCode("SCHEMA_VALIDATION_FAILED","Failed schema validation")}catch(o){throw o.results={errors:_.map(i.getLastErrors(),function(e){return a(e),e}),warnings:[]},o}};var validateArrayType=module.exports.validateArrayType=function(e){"array"===e.type&&_.isUndefined(e.items)&&throwErrorWithCode("OBJECT_MISSING_REQUIRED_PROPERTY","Missing required property: items")};module.exports.validateContentType=function(e,t,i){var a="function"==typeof i.end,r=a?i.getHeader("content-type"):i.headers["content-type"],n=_.union(e,t);if(r||(r=a?"text/plain":"application/octet-stream"),r=r.split(";")[0],n.length>0&&(a?!0:-1!==["POST","PUT"].indexOf(i.method))&&-1===n.indexOf(r))throw new Error("Invalid content type ("+r+").  These are valid: "+n.join(", "))};var validateEnum=module.exports.validateEnum=function(e,t){_.isUndefined(t)||_.isUndefined(e)||-1!==t.indexOf(e)||throwErrorWithCode("ENUM_MISMATCH","Not an allowable value ("+t.join(", ")+"): "+e)},validateMaximum=module.exports.validateMaximum=function(e,t,i,a){var r,n,o=a===!0?"MAXIMUM_EXCLUSIVE":"MAXIMUM";_.isUndefined(a)&&(a=!1),"integer"===i?n=parseInt(e,10):"number"===i&&(n=parseFloat(e)),_.isUndefined(t)||(r=parseFloat(t),a&&n>=r?throwErrorWithCode(o,"Greater than or equal to the configured maximum ("+t+"): "+e):n>r&&throwErrorWithCode(o,"Greater than the configured maximum ("+t+"): "+e))},validateMaxItems=module.exports.validateMaxItems=function(e,t){!_.isUndefined(t)&&e.length>t&&throwErrorWithCode("ARRAY_LENGTH_LONG","Array is too long ("+e.length+"), maximum "+t)},validateMaxLength=module.exports.validateMaxLength=function(e,t){!_.isUndefined(t)&&e.length>t&&throwErrorWithCode("MAX_LENGTH","String is too long ("+e.length+" chars), maximum "+t)},validateMaxProperties=module.exports.validateMaxProperties=function(e,t){var i=_.isPlainObject(e)?Object.keys(e).length:0;!_.isUndefined(t)&&i>t&&throwErrorWithCode("MAX_PROPERTIES","Number of properties is too many ("+i+" properties), maximum "+t)},validateMinimum=module.exports.validateMinimum=function(e,t,i,a){var r,n,o=a===!0?"MINIMUM_EXCLUSIVE":"MINIMUM";_.isUndefined(a)&&(a=!1),"integer"===i?n=parseInt(e,10):"number"===i&&(n=parseFloat(e)),_.isUndefined(t)||(r=parseFloat(t),a&&r>=n?throwErrorWithCode(o,"Less than or equal to the configured minimum ("+t+"): "+e):r>n&&throwErrorWithCode(o,"Less than the configured minimum ("+t+"): "+e))},validateMinItems=module.exports.validateMinItems=function(e,t){!_.isUndefined(t)&&e.length<t&&throwErrorWithCode("ARRAY_LENGTH_SHORT","Array is too short ("+e.length+"), minimum "+t)},validateMinLength=module.exports.validateMinLength=function(e,t){!_.isUndefined(t)&&e.length<t&&throwErrorWithCode("MIN_LENGTH","String is too short ("+e.length+" chars), minimum "+t)},validateMinProperties=module.exports.validateMinProperties=function(e,t){var i=_.isPlainObject(e)?Object.keys(e).length:0;!_.isUndefined(t)&&t>i&&throwErrorWithCode("MIN_PROPERTIES","Number of properties is too few ("+i+" properties), minimum "+t)},validateMultipleOf=module.exports.validateMultipleOf=function(e,t){_.isUndefined(t)||e%t===0||throwErrorWithCode("MULTIPLE_OF","Not a multiple of "+t)},validatePattern=module.exports.validatePattern=function(e,t){!_.isUndefined(t)&&_.isNull(e.match(new RegExp(t)))&&throwErrorWithCode("PATTERN","Does not match required pattern: "+t)};module.exports.validateRequiredness=function(e,t){!_.isUndefined(t)&&t===!0&&_.isUndefined(e)&&throwErrorWithCode("REQUIRED","Is required")};var validateTypeAndFormat=module.exports.validateTypeAndFormat=function e(t,i,a,r,n){var o=!0,d=i;if(_.isArray(i))_.each(i,function(i,n){e(t,i,a,r,!0)||throwErrorWithCode("INVALID_TYPE","Value at index "+n+" is not a valid "+a+": "+i)});else switch(a){case"boolean":"1.2"===t&&_.isString(i)&&("false"===i?i=!1:"true"===i&&(i=!0)),o=_.isBoolean(i);break;case"integer":"1.2"===t&&_.isString(i)&&(i=parseInt(i,10)),o=_.isFinite(i);break;case"number":"1.2"===t&&_.isString(i)&&(i=parseFloat(i)),o=_.isFinite(i);break;case"string":if(!_.isUndefined(r))switch(r){case"date":o=isValidDate(i);break;case"date-time":o=isValidDateTime(i)}break;case"void":o=_.isUndefined(i)}return n?o:void(o||throwErrorWithCode("INVALID_TYPE","void"!==a?"Not a valid "+(_.isUndefined(r)?"":r+" ")+a+": "+d:"Void does not allow a value"))},validateUniqueItems=module.exports.validateUniqueItems=function(e,t){_.isUndefined(t)||_.uniq(e).length===e.length||throwErrorWithCode("ARRAY_UNIQUE","Does not allow duplicate values: "+e.join(", "))};module.exports.validateSchemaConstraints=function(e,t,i,a){var r=function d(e){var t=e;return t.schema&&(i=i.concat(["schema"]),t=d(t.schema)),t},n=t.type;n||(t.schema?(t=r(t),n=t.type||"object"):n="responses"===i[i.length-2]?"void":"object");try{if("array"===n&&validateArrayType(t),_.isUndefined(a)&&(a="1.2"===e?t.defaultValue:t["default"],i=i.concat(["1.2"===e?"defaultValue":"default"])),_.isUndefined(a))return;"array"===n?_.isUndefined(t.items)?validateTypeAndFormat(e,a,n,t.format):validateTypeAndFormat(e,a,"array"===n?t.items.type:n,"array"===n&&t.items.format?t.items.format:t.format):validateTypeAndFormat(e,a,n,t.format),validateEnum(a,t["enum"]),validateMaximum(a,t.maximum,n,t.exclusiveMaximum),validateMaxItems(a,t.maxItems),validateMaxLength(a,t.maxLength),validateMaxProperties(a,t.maxProperties),validateMinimum(a,t.minimum,n,t.exclusiveMinimum),validateMinItems(a,t.minItems),validateMinLength(a,t.minLength),validateMinProperties(a,t.minProperties),validateMultipleOf(a,t.multipleOf),validatePattern(a,t.pattern),validateUniqueItems(a,t.uniqueItems)}catch(o){throw o.path=i,o}};

},{"./helpers":1,"lodash-compat/array/union":53,"lodash-compat/array/uniq":54,"lodash-compat/collection/each":55,"lodash-compat/collection/map":58,"lodash-compat/lang/cloneDeep":129,"lodash-compat/lang/isArray":131,"lodash-compat/lang/isBoolean":132,"lodash-compat/lang/isDate":133,"lodash-compat/lang/isFinite":135,"lodash-compat/lang/isNull":138,"lodash-compat/lang/isNumber":139,"lodash-compat/lang/isPlainObject":141,"lodash-compat/lang/isString":142,"lodash-compat/lang/isUndefined":144}],4:[function(require,module,exports){
(function (process,global){
!function(){function n(){}function t(n){var t=!1;return function(){if(t)throw new Error("Callback was already called.");t=!0,n.apply(this,arguments)}}function e(n){var t=!1;return function(){t||(t=!0,n.apply(this,arguments))}}function r(n){return P(n)||"number"==typeof n.length&&n.length>=0&&n.length%1===0}function u(n,t){return r(n)?i(n,t):f(n,t)}function i(n,t){for(var e=-1,r=n.length;++e<r;)t(n[e],e,n)}function o(n,t){for(var e=-1,r=n.length,u=Array(r);++e<r;)u[e]=t(n[e],e,n);return u}function c(n){return o(Array(n),function(n,t){return t})}function a(n,t,e){return i(n,function(n,r,u){e=t(e,n,r,u)}),e}function f(n,t){i(U(n),function(e){t(n[e],e)})}function l(n){var t,e,u=-1;return r(n)?(t=n.length,function(){return u++,t>u?u:null}):(e=U(n),t=e.length,function(){return u++,t>u?e[u]:null})}function s(n,t){t=t||0;var e=-1,r=n.length;t&&(r-=t,r=0>r?0:r);for(var u=Array(r);++e<r;)u[e]=n[e+t];return u}function p(n){return function(t,e,r){return n(t,r)}}function m(r){return function(u,i,o){o=e(o||n),u=u||[];var c=l(u);if(0>=r)return o(null);var a=!1,f=0,s=!1;!function p(){if(a&&0>=f)return o(null);for(;r>f&&!s;){var n=c();if(null===n)return a=!0,void(0>=f&&o(null));f+=1,i(u[n],n,t(function(n){f-=1,n?(o(n),s=!0):p()}))}}()}}function h(n){return function(t,e,r){return n(L.eachOf,t,e,r)}}function g(n,t){return function(e,r,u){return t(m(n),e,r,u)}}function d(n){return function(t,e,r){return n(L.eachOfSeries,t,e,r)}}function v(t,r,u,i){i=e(i||n);var o=[];t(r,function(n,t,e){u(n,function(n,r){o[t]=r,e(n)})},function(n){i(n,o)})}function y(n){return g(n,v)}function k(n,t,e,r){var u=[];t=o(t,function(n,t){return{index:t,value:n}}),n(t,function(n,t,r){e(n.value,function(t){t&&u.push(n),r()})},function(){r(o(u.sort(function(n,t){return n.index-t.index}),function(n){return n.value}))})}function b(n,t,e,r){k(n,t,function(n,t){e(n,function(n){t(!n)})},r)}function w(t,e,r,u){t(e,function(t,e,i){r(t,function(e){e?(u(t),u=n):i()})},function(){u()})}function O(t,e,u){u=u||n;var i=r(e)?[]:{};t(e,function(n,t,e){n(function(n){var r=s(arguments,1);r.length<=1&&(r=r[0]),i[t]=r,e(n)})},function(n){u(n,i)})}function x(n,t,e,r){var u=[];n(t,function(n,t,r){e(n,function(n,t){u=u.concat(t||[]),r(n)})},function(n){r(n,u)})}function S(e,r,u){function c(t,e,r,u){if(null!=u&&"function"!=typeof u)throw new Error("task callback must be a function");return t.started=!0,P(e)||(e=[e]),0===e.length&&t.idle()?L.setImmediate(function(){t.drain()}):(i(e,function(e){var i={data:e,callback:u||n};r?t.tasks.unshift(i):t.tasks.push(i),t.tasks.length===t.concurrency&&t.saturated()}),void L.setImmediate(t.process))}function a(n,t){return function(){f-=1;var e=arguments;i(t,function(n){n.callback.apply(n,e)}),n.tasks.length+f===0&&n.drain(),n.process()}}if(null==r)r=1;else if(0===r)throw new Error("Concurrency must not be zero");var f=0,l={tasks:[],concurrency:r,payload:u,saturated:n,empty:n,drain:n,started:!1,paused:!1,push:function(n,t){c(l,n,!1,t)},kill:function(){l.drain=n,l.tasks=[]},unshift:function(n,t){c(l,n,!0,t)},process:function(){if(!l.paused&&f<l.concurrency&&l.tasks.length)for(;f<l.concurrency&&l.tasks.length;){var n=l.payload?l.tasks.splice(0,l.payload):l.tasks.splice(0,l.tasks.length),r=o(n,function(n){return n.data});0===l.tasks.length&&l.empty(),f+=1;var u=t(a(l,n));e(r,u)}},length:function(){return l.tasks.length},running:function(){return f},idle:function(){return l.tasks.length+f===0},pause:function(){l.paused=!0},resume:function(){if(l.paused!==!1){l.paused=!1;for(var n=Math.min(l.concurrency,l.tasks.length),t=1;n>=t;t++)L.setImmediate(l.process)}}};return l}function E(n){return function(t){var e=s(arguments,1);t.apply(null,e.concat([function(t){var e=s(arguments,1);"undefined"!=typeof console&&(t?console.error&&console.error(t):console[n]&&i(e,function(t){console[n](t)}))}]))}}function I(n){return function(t,e,r){n(c(t),e,r)}}function T(n,t){function e(){var e=this,r=s(arguments),u=r.pop();return n(t,function(n,t,u){n.apply(e,r.concat([u]))},u)}if(arguments.length>2){var r=s(arguments,2);return e.apply(this,r)}return e}function j(n){return function(){var t=s(arguments),e=t.pop();t.push(function(){var n=arguments;r?L.setImmediate(function(){e.apply(null,n)}):e.apply(null,n)});var r=!0;n.apply(this,t),r=!1}}var A,L={},z="object"==typeof self&&self.self===self&&self||"object"==typeof global&&global.global===global&&global||this;null!=z&&(A=z.async),L.noConflict=function(){return z.async=A,L};var q,C=Object.prototype.toString,P=Array.isArray||function(n){return"[object Array]"===C.call(n)},U=Object.keys||function(n){var t=[];for(var e in n)n.hasOwnProperty(e)&&t.push(e);return t};"function"==typeof setImmediate&&(q=setImmediate),"undefined"!=typeof process&&process.nextTick?(L.nextTick=process.nextTick,q?L.setImmediate=function(n){q(n)}:L.setImmediate=L.nextTick):q?(L.nextTick=function(n){q(n)},L.setImmediate=L.nextTick):(L.nextTick=function(n){setTimeout(n,0)},L.setImmediate=L.nextTick),L.forEach=L.each=function(n,t,e){return L.eachOf(n,p(t),e)},L.forEachSeries=L.eachSeries=function(n,t,e){return L.eachOfSeries(n,p(t),e)},L.forEachLimit=L.eachLimit=function(n,t,e,r){return m(t)(n,p(e),r)},L.forEachOf=L.eachOf=function(i,o,c){function a(n){n?c(n):(l+=1,l>=f&&c(null))}c=e(c||n),i=i||[];var f=r(i)?i.length:U(i).length,l=0;return f?void u(i,function(n,e){o(i[e],e,t(a))}):c(null)},L.forEachOfSeries=L.eachOfSeries=function(r,u,i){function o(){var n=!0;return null===a?i(null):(u(r[a],a,t(function(t){if(t)i(t);else{if(a=c(),null===a)return i(null);n?L.nextTick(o):o()}})),void(n=!1))}i=e(i||n),r=r||[];var c=l(r),a=c();o()},L.forEachOfLimit=L.eachOfLimit=function(n,t,e,r){m(t)(n,e,r)},L.map=h(v),L.mapSeries=d(v),L.mapLimit=function(n,t,e,r){return y(t)(n,e,r)},L.inject=L.foldl=L.reduce=function(n,t,e,r){L.eachOfSeries(n,function(n,r,u){e(t,n,function(n,e){t=e,u(n)})},function(n){r(n||null,t)})},L.foldr=L.reduceRight=function(n,t,e,r){var u=o(n,function(n){return n}).reverse();L.reduce(u,t,e,r)},L.select=L.filter=h(k),L.selectSeries=L.filterSeries=d(k),L.reject=h(b),L.rejectSeries=d(b),L.detect=h(w),L.detectSeries=d(w),L.any=L.some=function(t,e,r){L.eachOf(t,function(t,u,i){e(t,function(t){t&&(r(!0),r=n),i()})},function(){r(!1)})},L.all=L.every=function(t,e,r){L.eachOf(t,function(t,u,i){e(t,function(t){t||(r(!1),r=n),i()})},function(){r(!0)})},L.sortBy=function(n,t,e){function r(n,t){var e=n.criteria,r=t.criteria;return r>e?-1:e>r?1:0}L.map(n,function(n,e){t(n,function(t,r){t?e(t):e(null,{value:n,criteria:r})})},function(n,t){return n?e(n):void e(null,o(t.sort(r),function(n){return n.value}))})},L.auto=function(t,r){function u(n){m.unshift(n)}function o(n){for(var t=0;t<m.length;t+=1)if(m[t]===n)return void m.splice(t,1)}function c(){l--,i(m.slice(0),function(n){n()})}r=e(r||n);var f=U(t),l=f.length;if(!l)return r(null);var p={},m=[];u(function(){l||r(null,p)}),i(f,function(n){function e(t){var e=s(arguments,1);if(e.length<=1&&(e=e[0]),t){var u={};i(U(p),function(n){u[n]=p[n]}),u[n]=e,r(t,u)}else p[n]=e,L.setImmediate(c)}function f(){return a(g,function(n,t){return n&&p.hasOwnProperty(t)},!0)&&!p.hasOwnProperty(n)}function l(){f()&&(o(l),h[h.length-1](e,p))}for(var m,h=P(t[n])?t[n]:[t[n]],g=h.slice(0,Math.abs(h.length-1))||[],d=g.length;d--;){if(!(m=t[g[d]]))throw new Error("Has inexistant dependency");if(P(m)&&~m.indexOf(n))throw new Error("Has cyclic dependencies")}f()?h[h.length-1](e,p):u(l)})},L.retry=function(){function n(n,t){if("number"==typeof t)n.times=parseInt(t,10)||e;else{if("object"!=typeof t)throw new Error("Unsupported argument type for 'times': "+typeof t);n.times=parseInt(t.times,10)||e,n.interval=parseInt(t.interval,10)||r}}function t(n,t){function e(n,e){return function(r){n(function(n,t){r(!n||e,{err:n,result:t})},t)}}function r(n){return function(t){setTimeout(function(){t(null)},n)}}for(;i.times;){var o=!(i.times-=1);u.push(e(i.task,o)),!o&&i.interval>0&&u.push(r(i.interval))}L.series(u,function(t,e){e=e[e.length-1],(n||i.callback)(e.err,e.result)})}var e=5,r=0,u=[],i={times:e,interval:r};switch(arguments.length){case 1:i.task=arguments[0];break;case 2:"number"==typeof arguments[0]||"object"==typeof arguments[0]?(n(i,arguments[0]),i.task=arguments[1]):(i.task=arguments[0],i.callback=arguments[1]);break;case 3:n(i,arguments[0]),i.task=arguments[1],i.callback=arguments[2];break;default:throw new Error("Invalid arguments - must be either (task), (task, callback), (times, task) or (times, task, callback)")}return i.callback?t():t},L.waterfall=function(t,r){function u(n){return function(t){if(t)r.apply(null,arguments);else{var e=s(arguments,1),i=n.next();i?e.push(u(i)):e.push(r),j(n).apply(null,e)}}}if(r=e(r||n),!P(t)){var i=new Error("First argument to waterfall must be an array of functions");return r(i)}return t.length?void u(L.iterator(t))():r()},L.parallel=function(n,t){O(L.eachOf,n,t)},L.parallelLimit=function(n,t,e){O(m(t),n,e)},L.series=function(t,e){e=e||n;var u=r(t)?[]:{};L.eachOfSeries(t,function(n,t,e){n(function(n){var r=s(arguments,1);r.length<=1&&(r=r[0]),u[t]=r,e(n)})},function(n){e(n,u)})},L.iterator=function(n){function t(e){function r(){return n.length&&n[e].apply(null,arguments),r.next()}return r.next=function(){return e<n.length-1?t(e+1):null},r}return t(0)},L.apply=function(n){var t=s(arguments,1);return function(){return n.apply(null,t.concat(s(arguments)))}},L.concat=h(x),L.concatSeries=d(x),L.whilst=function(t,e,r){r=r||n,t()?e(function(n){return n?r(n):void L.whilst(t,e,r)}):r(null)},L.doWhilst=function(t,e,r){r=r||n,t(function(n){if(n)return r(n);var u=s(arguments,1);e.apply(null,u)?L.doWhilst(t,e,r):r(null)})},L.until=function(t,e,r){r=r||n,t()?r(null):e(function(n){return n?r(n):void L.until(t,e,r)})},L.doUntil=function(t,e,r){r=r||n,t(function(n){if(n)return r(n);var u=s(arguments,1);e.apply(null,u)?r(null):L.doUntil(t,e,r)})},L.during=function(t,e,r){r=r||n,t(function(n,u){return n?r(n):void(u?e(function(n){return n?r(n):void L.during(t,e,r)}):r(null))})},L.doDuring=function(t,e,r){r=r||n,t(function(n){if(n)return r(n);var u=s(arguments,1);u.push(function(n,u){return n?r(n):void(u?L.doDuring(t,e,r):r(null))}),e.apply(null,u)})},L.queue=function(n,t){var e=S(function(t,e){n(t[0],e)},t,1);return e},L.priorityQueue=function(t,e){function r(n,t){return n.priority-t.priority}function u(n,t,e){for(var r=-1,u=n.length-1;u>r;){var i=r+(u-r+1>>>1);e(t,n[i])>=0?r=i:u=i-1}return r}function o(t,e,o,c){if(null!=c&&"function"!=typeof c)throw new Error("task callback must be a function");return t.started=!0,P(e)||(e=[e]),0===e.length?L.setImmediate(function(){t.drain()}):void i(e,function(e){var i={data:e,priority:o,callback:"function"==typeof c?c:n};t.tasks.splice(u(t.tasks,i,r)+1,0,i),t.tasks.length===t.concurrency&&t.saturated(),L.setImmediate(t.process)})}var c=L.queue(t,e);return c.push=function(n,t,e){o(c,n,t,e)},delete c.unshift,c},L.cargo=function(n,t){return S(n,1,t)},L.log=E("log"),L.dir=E("dir"),L.memoize=function(n,t){function e(){var e=s(arguments),i=e.pop(),o=t.apply(null,e);o in r?L.nextTick(function(){i.apply(null,r[o])}):o in u?u[o].push(i):(u[o]=[i],n.apply(null,e.concat([function(){r[o]=s(arguments);var n=u[o];delete u[o];for(var t=0,e=n.length;e>t;t++)n[t].apply(null,arguments)}])))}var r={},u={};return t=t||function(n){return n},e.memo=r,e.unmemoized=n,e},L.unmemoize=function(n){return function(){return(n.unmemoized||n).apply(null,arguments)}},L.times=I(L.map),L.timesSeries=I(L.mapSeries),L.timesLimit=function(n,t,e,r){return L.mapLimit(c(n),t,e,r)},L.seq=function(){var t=arguments;return function(){var e=this,r=s(arguments),u=r.slice(-1)[0];"function"==typeof u?r.pop():u=n,L.reduce(t,r,function(n,t,r){t.apply(e,n.concat([function(){var n=arguments[0],t=s(arguments,1);r(n,t)}]))},function(n,t){u.apply(e,[n].concat(t))})}},L.compose=function(){return L.seq.apply(null,Array.prototype.reverse.call(arguments))},L.applyEach=function(){var n=s(arguments);return T.apply(null,[L.eachOf].concat(n))},L.applyEachSeries=function(){var n=s(arguments);return T.apply(null,[L.eachOfSeries].concat(n))},L.forever=function(e,r){function u(n){return n?i(n):void o(u)}var i=t(r||n),o=j(e);u()},L.ensureAsync=j,L.constant=function(){var n=[null].concat(s(arguments));return function(t){return t.apply(this,n)}},L.wrapSync=L.asyncify=function(n){return function(){var t,e=s(arguments),r=e.pop();try{t=n.apply(this,e)}catch(u){return r(u)}r(null,t)}},"undefined"!=typeof module&&module.exports?module.exports=L:"undefined"!=typeof define&&define.amd?define([],function(){return L}):z.async=L}();

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"_process":6}],5:[function(require,module,exports){

},{}],6:[function(require,module,exports){
function cleanUpNextTick(){draining=!1,currentQueue.length?queue=currentQueue.concat(queue):queueIndex=-1,queue.length&&drainQueue()}function drainQueue(){if(!draining){var e=setTimeout(cleanUpNextTick);draining=!0;for(var n=queue.length;n;){for(currentQueue=queue,queue=[];++queueIndex<n;)currentQueue[queueIndex].run();queueIndex=-1,n=queue.length}currentQueue=null,draining=!1,clearTimeout(e)}}function Item(e,n){this.fun=e,this.array=n}function noop(){}var process=module.exports={},queue=[],draining=!1,currentQueue,queueIndex=-1;process.nextTick=function(e){var n=new Array(arguments.length-1);if(arguments.length>1)for(var r=1;r<arguments.length;r++)n[r-1]=arguments[r];queue.push(new Item(e,n)),1!==queue.length||draining||setTimeout(drainQueue,0)},Item.prototype.run=function(){this.fun.apply(null,this.array)},process.title="browser",process.browser=!0,process.env={},process.argv=[],process.version="",process.versions={},process.on=noop,process.addListener=noop,process.once=noop,process.off=noop,process.removeListener=noop,process.removeAllListeners=noop,process.emit=noop,process.binding=function(e){throw new Error("process.binding is not supported")},process.cwd=function(){return"/"},process.chdir=function(e){throw new Error("process.chdir is not supported")},process.umask=function(){return 0};

},{}],7:[function(require,module,exports){
(function (global){
!function(e){function o(e){throw RangeError(T[e])}function n(e,o){for(var n=e.length,r=[];n--;)r[n]=o(e[n]);return r}function r(e,o){var r=e.split("@"),t="";r.length>1&&(t=r[0]+"@",e=r[1]),e=e.replace(S,".");var u=e.split("."),i=n(u,o).join(".");return t+i}function t(e){for(var o,n,r=[],t=0,u=e.length;u>t;)o=e.charCodeAt(t++),o>=55296&&56319>=o&&u>t?(n=e.charCodeAt(t++),56320==(64512&n)?r.push(((1023&o)<<10)+(1023&n)+65536):(r.push(o),t--)):r.push(o);return r}function u(e){return n(e,function(e){var o="";return e>65535&&(e-=65536,o+=P(e>>>10&1023|55296),e=56320|1023&e),o+=P(e)}).join("")}function i(e){return 10>e-48?e-22:26>e-65?e-65:26>e-97?e-97:b}function f(e,o){return e+22+75*(26>e)-((0!=o)<<5)}function c(e,o,n){var r=0;for(e=n?M(e/j):e>>1,e+=M(e/o);e>L*C>>1;r+=b)e=M(e/L);return M(r+(L+1)*e/(e+m))}function l(e){var n,r,t,f,l,s,d,a,p,h,v=[],g=e.length,w=0,m=I,j=A;for(r=e.lastIndexOf(E),0>r&&(r=0),t=0;r>t;++t)e.charCodeAt(t)>=128&&o("not-basic"),v.push(e.charCodeAt(t));for(f=r>0?r+1:0;g>f;){for(l=w,s=1,d=b;f>=g&&o("invalid-input"),a=i(e.charCodeAt(f++)),(a>=b||a>M((x-w)/s))&&o("overflow"),w+=a*s,p=j>=d?y:d>=j+C?C:d-j,!(p>a);d+=b)h=b-p,s>M(x/h)&&o("overflow"),s*=h;n=v.length+1,j=c(w-l,n,0==l),M(w/n)>x-m&&o("overflow"),m+=M(w/n),w%=n,v.splice(w++,0,m)}return u(v)}function s(e){var n,r,u,i,l,s,d,a,p,h,v,g,w,m,j,F=[];for(e=t(e),g=e.length,n=I,r=0,l=A,s=0;g>s;++s)v=e[s],128>v&&F.push(P(v));for(u=i=F.length,i&&F.push(E);g>u;){for(d=x,s=0;g>s;++s)v=e[s],v>=n&&d>v&&(d=v);for(w=u+1,d-n>M((x-r)/w)&&o("overflow"),r+=(d-n)*w,n=d,s=0;g>s;++s)if(v=e[s],n>v&&++r>x&&o("overflow"),v==n){for(a=r,p=b;h=l>=p?y:p>=l+C?C:p-l,!(h>a);p+=b)j=a-h,m=b-h,F.push(P(f(h+j%m,0))),a=M(j/m);F.push(P(f(a,0))),l=c(r,w,u==i),r=0,++u}++r,++n}return F.join("")}function d(e){return r(e,function(e){return F.test(e)?l(e.slice(4).toLowerCase()):e})}function a(e){return r(e,function(e){return O.test(e)?"xn--"+s(e):e})}var p="object"==typeof exports&&exports&&!exports.nodeType&&exports,h="object"==typeof module&&module&&!module.nodeType&&module,v="object"==typeof global&&global;(v.global===v||v.window===v||v.self===v)&&(e=v);var g,w,x=2147483647,b=36,y=1,C=26,m=38,j=700,A=72,I=128,E="-",F=/^xn--/,O=/[^\x20-\x7E]/,S=/[\x2E\u3002\uFF0E\uFF61]/g,T={overflow:"Overflow: input needs wider integers to process","not-basic":"Illegal input >= 0x80 (not a basic code point)","invalid-input":"Invalid input"},L=b-y,M=Math.floor,P=String.fromCharCode;if(g={version:"1.3.2",ucs2:{decode:t,encode:u},decode:l,encode:s,toASCII:a,toUnicode:d},"function"==typeof define&&"object"==typeof define.amd&&define.amd)define("punycode",function(){return g});else if(p&&h)if(module.exports==p)h.exports=g;else for(w in g)g.hasOwnProperty(w)&&(p[w]=g[w]);else e.punycode=g}(this);

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],8:[function(require,module,exports){
"use strict";function hasOwnProperty(r,e){return Object.prototype.hasOwnProperty.call(r,e)}module.exports=function(r,e,t,n){e=e||"&",t=t||"=";var o={};if("string"!=typeof r||0===r.length)return o;var a=/\+/g;r=r.split(e);var s=1e3;n&&"number"==typeof n.maxKeys&&(s=n.maxKeys);var p=r.length;s>0&&p>s&&(p=s);for(var y=0;p>y;++y){var u,c,i,l,f=r[y].replace(a,"%20"),v=f.indexOf(t);v>=0?(u=f.substr(0,v),c=f.substr(v+1)):(u=f,c=""),i=decodeURIComponent(u),l=decodeURIComponent(c),hasOwnProperty(o,i)?isArray(o[i])?o[i].push(l):o[i]=[o[i],l]:o[i]=l}return o};var isArray=Array.isArray||function(r){return"[object Array]"===Object.prototype.toString.call(r)};

},{}],9:[function(require,module,exports){
"use strict";function map(r,e){if(r.map)return r.map(e);for(var t=[],n=0;n<r.length;n++)t.push(e(r[n],n));return t}var stringifyPrimitive=function(r){switch(typeof r){case"string":return r;case"boolean":return r?"true":"false";case"number":return isFinite(r)?r:"";default:return""}};module.exports=function(r,e,t,n){return e=e||"&",t=t||"=",null===r&&(r=void 0),"object"==typeof r?map(objectKeys(r),function(n){var i=encodeURIComponent(stringifyPrimitive(n))+t;return isArray(r[n])?map(r[n],function(r){return i+encodeURIComponent(stringifyPrimitive(r))}).join(e):i+encodeURIComponent(stringifyPrimitive(r[n]))}).join(e):n?encodeURIComponent(stringifyPrimitive(n))+t+encodeURIComponent(stringifyPrimitive(r)):""};var isArray=Array.isArray||function(r){return"[object Array]"===Object.prototype.toString.call(r)},objectKeys=Object.keys||function(r){var e=[];for(var t in r)Object.prototype.hasOwnProperty.call(r,t)&&e.push(t);return e};

},{}],10:[function(require,module,exports){
"use strict";exports.decode=exports.parse=require("./decode"),exports.encode=exports.stringify=require("./encode");

},{"./decode":8,"./encode":9}],11:[function(require,module,exports){
function Url(){this.protocol=null,this.slashes=null,this.auth=null,this.host=null,this.port=null,this.hostname=null,this.hash=null,this.search=null,this.query=null,this.pathname=null,this.path=null,this.href=null}function urlParse(t,s,e){if(t&&isObject(t)&&t instanceof Url)return t;var h=new Url;return h.parse(t,s,e),h}function urlFormat(t){return isString(t)&&(t=urlParse(t)),t instanceof Url?t.format():Url.prototype.format.call(t)}function urlResolve(t,s){return urlParse(t,!1,!0).resolve(s)}function urlResolveObject(t,s){return t?urlParse(t,!1,!0).resolveObject(s):s}function isString(t){return"string"==typeof t}function isObject(t){return"object"==typeof t&&null!==t}function isNull(t){return null===t}function isNullOrUndefined(t){return null==t}var punycode=require("punycode");exports.parse=urlParse,exports.resolve=urlResolve,exports.resolveObject=urlResolveObject,exports.format=urlFormat,exports.Url=Url;var protocolPattern=/^([a-z0-9.+-]+:)/i,portPattern=/:[0-9]*$/,delims=["<",">",'"',"`"," ","\r","\n","	"],unwise=["{","}","|","\\","^","`"].concat(delims),autoEscape=["'"].concat(unwise),nonHostChars=["%","/","?",";","#"].concat(autoEscape),hostEndingChars=["/","?","#"],hostnameMaxLen=255,hostnamePartPattern=/^[a-z0-9A-Z_-]{0,63}$/,hostnamePartStart=/^([a-z0-9A-Z_-]{0,63})(.*)$/,unsafeProtocol={javascript:!0,"javascript:":!0},hostlessProtocol={javascript:!0,"javascript:":!0},slashedProtocol={http:!0,https:!0,ftp:!0,gopher:!0,file:!0,"http:":!0,"https:":!0,"ftp:":!0,"gopher:":!0,"file:":!0},querystring=require("querystring");Url.prototype.parse=function(t,s,e){if(!isString(t))throw new TypeError("Parameter 'url' must be a string, not "+typeof t);var h=t;h=h.trim();var r=protocolPattern.exec(h);if(r){r=r[0];var o=r.toLowerCase();this.protocol=o,h=h.substr(r.length)}if(e||r||h.match(/^\/\/[^@\/]+@[^@\/]+/)){var a="//"===h.substr(0,2);!a||r&&hostlessProtocol[r]||(h=h.substr(2),this.slashes=!0)}if(!hostlessProtocol[r]&&(a||r&&!slashedProtocol[r])){for(var n=-1,i=0;i<hostEndingChars.length;i++){var l=h.indexOf(hostEndingChars[i]);-1!==l&&(-1===n||n>l)&&(n=l)}var c,u;u=-1===n?h.lastIndexOf("@"):h.lastIndexOf("@",n),-1!==u&&(c=h.slice(0,u),h=h.slice(u+1),this.auth=decodeURIComponent(c)),n=-1;for(var i=0;i<nonHostChars.length;i++){var l=h.indexOf(nonHostChars[i]);-1!==l&&(-1===n||n>l)&&(n=l)}-1===n&&(n=h.length),this.host=h.slice(0,n),h=h.slice(n),this.parseHost(),this.hostname=this.hostname||"";var p="["===this.hostname[0]&&"]"===this.hostname[this.hostname.length-1];if(!p)for(var f=this.hostname.split(/\./),i=0,m=f.length;m>i;i++){var v=f[i];if(v&&!v.match(hostnamePartPattern)){for(var g="",y=0,d=v.length;d>y;y++)g+=v.charCodeAt(y)>127?"x":v[y];if(!g.match(hostnamePartPattern)){var P=f.slice(0,i),b=f.slice(i+1),j=v.match(hostnamePartStart);j&&(P.push(j[1]),b.unshift(j[2])),b.length&&(h="/"+b.join(".")+h),this.hostname=P.join(".");break}}}if(this.hostname.length>hostnameMaxLen?this.hostname="":this.hostname=this.hostname.toLowerCase(),!p){for(var O=this.hostname.split("."),q=[],i=0;i<O.length;++i){var x=O[i];q.push(x.match(/[^A-Za-z0-9_-]/)?"xn--"+punycode.encode(x):x)}this.hostname=q.join(".")}var U=this.port?":"+this.port:"",C=this.hostname||"";this.host=C+U,this.href+=this.host,p&&(this.hostname=this.hostname.substr(1,this.hostname.length-2),"/"!==h[0]&&(h="/"+h))}if(!unsafeProtocol[o])for(var i=0,m=autoEscape.length;m>i;i++){var A=autoEscape[i],E=encodeURIComponent(A);E===A&&(E=escape(A)),h=h.split(A).join(E)}var w=h.indexOf("#");-1!==w&&(this.hash=h.substr(w),h=h.slice(0,w));var R=h.indexOf("?");if(-1!==R?(this.search=h.substr(R),this.query=h.substr(R+1),s&&(this.query=querystring.parse(this.query)),h=h.slice(0,R)):s&&(this.search="",this.query={}),h&&(this.pathname=h),slashedProtocol[o]&&this.hostname&&!this.pathname&&(this.pathname="/"),this.pathname||this.search){var U=this.pathname||"",x=this.search||"";this.path=U+x}return this.href=this.format(),this},Url.prototype.format=function(){var t=this.auth||"";t&&(t=encodeURIComponent(t),t=t.replace(/%3A/i,":"),t+="@");var s=this.protocol||"",e=this.pathname||"",h=this.hash||"",r=!1,o="";this.host?r=t+this.host:this.hostname&&(r=t+(-1===this.hostname.indexOf(":")?this.hostname:"["+this.hostname+"]"),this.port&&(r+=":"+this.port)),this.query&&isObject(this.query)&&Object.keys(this.query).length&&(o=querystring.stringify(this.query));var a=this.search||o&&"?"+o||"";return s&&":"!==s.substr(-1)&&(s+=":"),this.slashes||(!s||slashedProtocol[s])&&r!==!1?(r="//"+(r||""),e&&"/"!==e.charAt(0)&&(e="/"+e)):r||(r=""),h&&"#"!==h.charAt(0)&&(h="#"+h),a&&"?"!==a.charAt(0)&&(a="?"+a),e=e.replace(/[?#]/g,function(t){return encodeURIComponent(t)}),a=a.replace("#","%23"),s+r+e+a+h},Url.prototype.resolve=function(t){return this.resolveObject(urlParse(t,!1,!0)).format()},Url.prototype.resolveObject=function(t){if(isString(t)){var s=new Url;s.parse(t,!1,!0),t=s}var e=new Url;if(Object.keys(this).forEach(function(t){e[t]=this[t]},this),e.hash=t.hash,""===t.href)return e.href=e.format(),e;if(t.slashes&&!t.protocol)return Object.keys(t).forEach(function(s){"protocol"!==s&&(e[s]=t[s])}),slashedProtocol[e.protocol]&&e.hostname&&!e.pathname&&(e.path=e.pathname="/"),e.href=e.format(),e;if(t.protocol&&t.protocol!==e.protocol){if(!slashedProtocol[t.protocol])return Object.keys(t).forEach(function(s){e[s]=t[s]}),e.href=e.format(),e;if(e.protocol=t.protocol,t.host||hostlessProtocol[t.protocol])e.pathname=t.pathname;else{for(var h=(t.pathname||"").split("/");h.length&&!(t.host=h.shift()););t.host||(t.host=""),t.hostname||(t.hostname=""),""!==h[0]&&h.unshift(""),h.length<2&&h.unshift(""),e.pathname=h.join("/")}if(e.search=t.search,e.query=t.query,e.host=t.host||"",e.auth=t.auth,e.hostname=t.hostname||t.host,e.port=t.port,e.pathname||e.search){var r=e.pathname||"",o=e.search||"";e.path=r+o}return e.slashes=e.slashes||t.slashes,e.href=e.format(),e}var a=e.pathname&&"/"===e.pathname.charAt(0),n=t.host||t.pathname&&"/"===t.pathname.charAt(0),i=n||a||e.host&&t.pathname,l=i,c=e.pathname&&e.pathname.split("/")||[],h=t.pathname&&t.pathname.split("/")||[],u=e.protocol&&!slashedProtocol[e.protocol];if(u&&(e.hostname="",e.port=null,e.host&&(""===c[0]?c[0]=e.host:c.unshift(e.host)),e.host="",t.protocol&&(t.hostname=null,t.port=null,t.host&&(""===h[0]?h[0]=t.host:h.unshift(t.host)),t.host=null),i=i&&(""===h[0]||""===c[0])),n)e.host=t.host||""===t.host?t.host:e.host,e.hostname=t.hostname||""===t.hostname?t.hostname:e.hostname,e.search=t.search,e.query=t.query,c=h;else if(h.length)c||(c=[]),c.pop(),c=c.concat(h),e.search=t.search,e.query=t.query;else if(!isNullOrUndefined(t.search)){if(u){e.hostname=e.host=c.shift();var p=e.host&&e.host.indexOf("@")>0?e.host.split("@"):!1;p&&(e.auth=p.shift(),e.host=e.hostname=p.shift())}return e.search=t.search,e.query=t.query,isNull(e.pathname)&&isNull(e.search)||(e.path=(e.pathname?e.pathname:"")+(e.search?e.search:"")),e.href=e.format(),e}if(!c.length)return e.pathname=null,e.search?e.path="/"+e.search:e.path=null,e.href=e.format(),e;for(var f=c.slice(-1)[0],m=(e.host||t.host)&&("."===f||".."===f)||""===f,v=0,g=c.length;g>=0;g--)f=c[g],"."==f?c.splice(g,1):".."===f?(c.splice(g,1),v++):v&&(c.splice(g,1),v--);if(!i&&!l)for(;v--;v)c.unshift("..");!i||""===c[0]||c[0]&&"/"===c[0].charAt(0)||c.unshift(""),m&&"/"!==c.join("/").substr(-1)&&c.push("");var y=""===c[0]||c[0]&&"/"===c[0].charAt(0);if(u){e.hostname=e.host=y?"":c.length?c.shift():"";var p=e.host&&e.host.indexOf("@")>0?e.host.split("@"):!1;p&&(e.auth=p.shift(),e.host=e.hostname=p.shift())}return i=i||e.host&&c.length,i&&!y&&c.unshift(""),c.length?e.pathname=c.join("/"):(e.pathname=null,e.path=null),isNull(e.pathname)&&isNull(e.search)||(e.path=(e.pathname?e.pathname:"")+(e.search?e.search:"")),e.auth=t.auth||e.auth,e.slashes=e.slashes||t.slashes,e.href=e.format(),e},Url.prototype.parseHost=function(){var t=this.host,s=portPattern.exec(t);s&&(s=s[0],":"!==s&&(this.port=s.substr(1)),t=t.substr(0,t.length-s.length)),t&&(this.hostname=t)};

},{"punycode":7,"querystring":10}],12:[function(require,module,exports){
"use strict";var yaml=require("./lib/js-yaml.js");module.exports=yaml;

},{"./lib/js-yaml.js":13}],13:[function(require,module,exports){
"use strict";function deprecated(e){return function(){throw new Error("Function "+e+" is deprecated and cannot be used.")}}var loader=require("./js-yaml/loader"),dumper=require("./js-yaml/dumper");module.exports.Type=require("./js-yaml/type"),module.exports.Schema=require("./js-yaml/schema"),module.exports.FAILSAFE_SCHEMA=require("./js-yaml/schema/failsafe"),module.exports.JSON_SCHEMA=require("./js-yaml/schema/json"),module.exports.CORE_SCHEMA=require("./js-yaml/schema/core"),module.exports.DEFAULT_SAFE_SCHEMA=require("./js-yaml/schema/default_safe"),module.exports.DEFAULT_FULL_SCHEMA=require("./js-yaml/schema/default_full"),module.exports.load=loader.load,module.exports.loadAll=loader.loadAll,module.exports.safeLoad=loader.safeLoad,module.exports.safeLoadAll=loader.safeLoadAll,module.exports.dump=dumper.dump,module.exports.safeDump=dumper.safeDump,module.exports.YAMLException=require("./js-yaml/exception"),module.exports.MINIMAL_SCHEMA=require("./js-yaml/schema/failsafe"),module.exports.SAFE_SCHEMA=require("./js-yaml/schema/default_safe"),module.exports.DEFAULT_SCHEMA=require("./js-yaml/schema/default_full"),module.exports.scan=deprecated("scan"),module.exports.parse=deprecated("parse"),module.exports.compose=deprecated("compose"),module.exports.addConstructor=deprecated("addConstructor");

},{"./js-yaml/dumper":15,"./js-yaml/exception":16,"./js-yaml/loader":17,"./js-yaml/schema":19,"./js-yaml/schema/core":20,"./js-yaml/schema/default_full":21,"./js-yaml/schema/default_safe":22,"./js-yaml/schema/failsafe":23,"./js-yaml/schema/json":24,"./js-yaml/type":25}],14:[function(require,module,exports){
"use strict";function isNothing(e){return"undefined"==typeof e||null===e}function isObject(e){return"object"==typeof e&&null!==e}function toArray(e){return Array.isArray(e)?e:isNothing(e)?[]:[e]}function extend(e,t){var r,o,n,i;if(t)for(i=Object.keys(t),r=0,o=i.length;o>r;r+=1)n=i[r],e[n]=t[n];return e}function repeat(e,t){var r,o="";for(r=0;t>r;r+=1)o+=e;return o}function isNegativeZero(e){return 0===e&&Number.NEGATIVE_INFINITY===1/e}module.exports.isNothing=isNothing,module.exports.isObject=isObject,module.exports.toArray=toArray,module.exports.repeat=repeat,module.exports.isNegativeZero=isNegativeZero,module.exports.extend=extend;

},{}],15:[function(require,module,exports){
"use strict";function compileStyleMap(e,t){var n,i,r,E,o,s,c;if(null===t)return{};for(n={},i=Object.keys(t),r=0,E=i.length;E>r;r+=1)o=i[r],s=String(t[o]),"!!"===o.slice(0,2)&&(o="tag:yaml.org,2002:"+o.slice(2)),c=e.compiledTypeMap[o],c&&_hasOwnProperty.call(c.styleAliases,s)&&(s=c.styleAliases[s]),n[o]=s;return n}function encodeHex(e){var t,n,i;if(t=e.toString(16).toUpperCase(),255>=e)n="x",i=2;else if(65535>=e)n="u",i=4;else{if(!(4294967295>=e))throw new YAMLException("code point within a string may not be greater than 0xFFFFFFFF");n="U",i=8}return"\\"+n+common.repeat("0",i-t.length)+t}function State(e){this.schema=e.schema||DEFAULT_FULL_SCHEMA,this.indent=Math.max(1,e.indent||2),this.skipInvalid=e.skipInvalid||!1,this.flowLevel=common.isNothing(e.flowLevel)?-1:e.flowLevel,this.styleMap=compileStyleMap(this.schema,e.styles||null),this.sortKeys=e.sortKeys||!1,this.implicitTypes=this.schema.compiledImplicit,this.explicitTypes=this.schema.compiledExplicit,this.tag=null,this.result="",this.duplicates=[],this.usedDuplicates=null}function indentString(e,t){for(var n,i=common.repeat(" ",t),r=0,E=-1,o="",s=e.length;s>r;)E=e.indexOf("\n",r),-1===E?(n=e.slice(r),r=s):(n=e.slice(r,E+1),r=E+1),n.length&&"\n"!==n&&(o+=i),o+=n;return o}function generateNextLine(e,t){return"\n"+common.repeat(" ",e.indent*t)}function testImplicitResolving(e,t){var n,i,r;for(n=0,i=e.implicitTypes.length;i>n;n+=1)if(r=e.implicitTypes[n],r.resolve(t))return!0;return!1}function StringBuilder(e){this.source=e,this.result="",this.checkpoint=0}function writeScalar(e,t,n){var i,r,E,o,s,c,p,l,u,A,a,C,_,d,S,f,h,R,m,g,N;if(0===t.length)return void(e.dump="''");if(-1!==DEPRECATED_BOOLEANS_SYNTAX.indexOf(t))return void(e.dump="'"+t+"'");for(i=!0,r=t.length?t.charCodeAt(0):0,E=CHAR_SPACE===r||CHAR_SPACE===t.charCodeAt(t.length-1),(CHAR_MINUS===r||CHAR_QUESTION===r||CHAR_COMMERCIAL_AT===r||CHAR_GRAVE_ACCENT===r)&&(i=!1),E?(i=!1,o=!1,s=!1):(o=!0,s=!0),c=!0,p=new StringBuilder(t),l=!1,u=0,A=0,a=e.indent*n,C=80,40>a?C-=a:C=40,d=0;d<t.length;d++){if(_=t.charCodeAt(d),i){if(simpleChar(_))continue;i=!1}c&&_===CHAR_SINGLE_QUOTE&&(c=!1),S=ESCAPE_SEQUENCES[_],f=needsHexEscape(_),(S||f)&&(_!==CHAR_LINE_FEED&&_!==CHAR_DOUBLE_QUOTE&&_!==CHAR_SINGLE_QUOTE?(o=!1,s=!1):_===CHAR_LINE_FEED&&(l=!0,c=!1,d>0&&(h=t.charCodeAt(d-1),h===CHAR_SPACE&&(s=!1,o=!1)),o&&(R=d-u,u=d,R>A&&(A=R))),_!==CHAR_DOUBLE_QUOTE&&(c=!1),p.takeUpTo(d),p.escapeChar())}if(i&&testImplicitResolving(e,t)&&(i=!1),m="",(o||s)&&(g=0,t.charCodeAt(t.length-1)===CHAR_LINE_FEED&&(g+=1,t.charCodeAt(t.length-2)===CHAR_LINE_FEED&&(g+=1)),0===g?m="-":2===g&&(m="+")),s&&C>A&&(o=!1),l||(s=!1),i)e.dump=t;else if(c)e.dump="'"+t+"'";else if(o)N=fold(t,C),e.dump=">"+m+"\n"+indentString(N,a);else if(s)m||(t=t.replace(/\n$/,"")),e.dump="|"+m+"\n"+indentString(t,a);else{if(!p)throw new Error("Failed to dump scalar value");p.finish(),e.dump='"'+p.result+'"'}}function fold(e,t){var n,i="",r=0,E=e.length,o=/\n+$/.exec(e);for(o&&(E=o.index+1);E>r;)n=e.indexOf("\n",r),n>E||-1===n?(i&&(i+="\n\n"),i+=foldLine(e.slice(r,E),t),r=E):(i&&(i+="\n\n"),i+=foldLine(e.slice(r,n),t),r=n+1);return o&&"\n"!==o[0]&&(i+=o[0]),i}function foldLine(e,t){if(""===e)return e;for(var n,i,r,E=/[^\s] [^\s]/g,o="",s=0,c=0,p=E.exec(e);p;)n=p.index,n-c>t&&(i=s!==c?s:n,o&&(o+="\n"),r=e.slice(c,i),o+=r,c=i+1),s=n+1,p=E.exec(e);return o&&(o+="\n"),o+=c!==s&&e.length-c>t?e.slice(c,s)+"\n"+e.slice(s+1):e.slice(c)}function simpleChar(e){return CHAR_TAB!==e&&CHAR_LINE_FEED!==e&&CHAR_CARRIAGE_RETURN!==e&&CHAR_COMMA!==e&&CHAR_LEFT_SQUARE_BRACKET!==e&&CHAR_RIGHT_SQUARE_BRACKET!==e&&CHAR_LEFT_CURLY_BRACKET!==e&&CHAR_RIGHT_CURLY_BRACKET!==e&&CHAR_SHARP!==e&&CHAR_AMPERSAND!==e&&CHAR_ASTERISK!==e&&CHAR_EXCLAMATION!==e&&CHAR_VERTICAL_LINE!==e&&CHAR_GREATER_THAN!==e&&CHAR_SINGLE_QUOTE!==e&&CHAR_DOUBLE_QUOTE!==e&&CHAR_PERCENT!==e&&CHAR_COLON!==e&&!ESCAPE_SEQUENCES[e]&&!needsHexEscape(e)}function needsHexEscape(e){return!(e>=32&&126>=e||133===e||e>=160&&55295>=e||e>=57344&&65533>=e||e>=65536&&1114111>=e)}function writeFlowSequence(e,t,n){var i,r,E="",o=e.tag;for(i=0,r=n.length;r>i;i+=1)writeNode(e,t,n[i],!1,!1)&&(0!==i&&(E+=", "),E+=e.dump);e.tag=o,e.dump="["+E+"]"}function writeBlockSequence(e,t,n,i){var r,E,o="",s=e.tag;for(r=0,E=n.length;E>r;r+=1)writeNode(e,t+1,n[r],!0,!0)&&(i&&0===r||(o+=generateNextLine(e,t)),o+="- "+e.dump);e.tag=s,e.dump=o||"[]"}function writeFlowMapping(e,t,n){var i,r,E,o,s,c="",p=e.tag,l=Object.keys(n);for(i=0,r=l.length;r>i;i+=1)s="",0!==i&&(s+=", "),E=l[i],o=n[E],writeNode(e,t,E,!1,!1)&&(e.dump.length>1024&&(s+="? "),s+=e.dump+": ",writeNode(e,t,o,!1,!1)&&(s+=e.dump,c+=s));e.tag=p,e.dump="{"+c+"}"}function writeBlockMapping(e,t,n,i){var r,E,o,s,c,p,l="",u=e.tag,A=Object.keys(n);if(e.sortKeys===!0)A.sort();else if("function"==typeof e.sortKeys)A.sort(e.sortKeys);else if(e.sortKeys)throw new YAMLException("sortKeys must be a boolean or a function");for(r=0,E=A.length;E>r;r+=1)p="",i&&0===r||(p+=generateNextLine(e,t)),o=A[r],s=n[o],writeNode(e,t+1,o,!0,!0)&&(c=null!==e.tag&&"?"!==e.tag||e.dump&&e.dump.length>1024,c&&(p+=e.dump&&CHAR_LINE_FEED===e.dump.charCodeAt(0)?"?":"? "),p+=e.dump,c&&(p+=generateNextLine(e,t)),writeNode(e,t+1,s,!0,c)&&(p+=e.dump&&CHAR_LINE_FEED===e.dump.charCodeAt(0)?":":": ",p+=e.dump,l+=p));e.tag=u,e.dump=l||"{}"}function detectType(e,t,n){var i,r,E,o,s,c;for(r=n?e.explicitTypes:e.implicitTypes,E=0,o=r.length;o>E;E+=1)if(s=r[E],(s.instanceOf||s.predicate)&&(!s.instanceOf||"object"==typeof t&&t instanceof s.instanceOf)&&(!s.predicate||s.predicate(t))){if(e.tag=n?s.tag:"?",s.represent){if(c=e.styleMap[s.tag]||s.defaultStyle,"[object Function]"===_toString.call(s.represent))i=s.represent(t,c);else{if(!_hasOwnProperty.call(s.represent,c))throw new YAMLException("!<"+s.tag+'> tag resolver accepts not "'+c+'" style');i=s.represent[c](t,c)}e.dump=i}return!0}return!1}function writeNode(e,t,n,i,r){e.tag=null,e.dump=n,detectType(e,n,!1)||detectType(e,n,!0);var E=_toString.call(e.dump);i&&(i=0>e.flowLevel||e.flowLevel>t),(null!==e.tag&&"?"!==e.tag||2!==e.indent&&t>0)&&(r=!1);var o,s,c="[object Object]"===E||"[object Array]"===E;if(c&&(o=e.duplicates.indexOf(n),s=-1!==o),s&&e.usedDuplicates[o])e.dump="*ref_"+o;else{if(c&&s&&!e.usedDuplicates[o]&&(e.usedDuplicates[o]=!0),"[object Object]"===E)i&&0!==Object.keys(e.dump).length?(writeBlockMapping(e,t,e.dump,r),s&&(e.dump="&ref_"+o+(0===t?"\n":"")+e.dump)):(writeFlowMapping(e,t,e.dump),s&&(e.dump="&ref_"+o+" "+e.dump));else if("[object Array]"===E)i&&0!==e.dump.length?(writeBlockSequence(e,t,e.dump,r),s&&(e.dump="&ref_"+o+(0===t?"\n":"")+e.dump)):(writeFlowSequence(e,t,e.dump),s&&(e.dump="&ref_"+o+" "+e.dump));else{if("[object String]"!==E){if(e.skipInvalid)return!1;throw new YAMLException("unacceptable kind of an object to dump "+E)}"?"!==e.tag&&writeScalar(e,e.dump,t)}null!==e.tag&&"?"!==e.tag&&(e.dump="!<"+e.tag+"> "+e.dump)}return!0}function getDuplicateReferences(e,t){var n,i,r=[],E=[];for(inspectNode(e,r,E),n=0,i=E.length;i>n;n+=1)t.duplicates.push(r[E[n]]);t.usedDuplicates=new Array(i)}function inspectNode(e,t,n){var i,r,E;_toString.call(e);if(null!==e&&"object"==typeof e)if(r=t.indexOf(e),-1!==r)-1===n.indexOf(r)&&n.push(r);else if(t.push(e),Array.isArray(e))for(r=0,E=e.length;E>r;r+=1)inspectNode(e[r],t,n);else for(i=Object.keys(e),r=0,E=i.length;E>r;r+=1)inspectNode(e[i[r]],t,n)}function dump(e,t){t=t||{};var n=new State(t);return getDuplicateReferences(e,n),writeNode(n,0,e,!0,!0)?n.dump+"\n":""}function safeDump(e,t){return dump(e,common.extend({schema:DEFAULT_SAFE_SCHEMA},t))}var common=require("./common"),YAMLException=require("./exception"),DEFAULT_FULL_SCHEMA=require("./schema/default_full"),DEFAULT_SAFE_SCHEMA=require("./schema/default_safe"),_toString=Object.prototype.toString,_hasOwnProperty=Object.prototype.hasOwnProperty,CHAR_TAB=9,CHAR_LINE_FEED=10,CHAR_CARRIAGE_RETURN=13,CHAR_SPACE=32,CHAR_EXCLAMATION=33,CHAR_DOUBLE_QUOTE=34,CHAR_SHARP=35,CHAR_PERCENT=37,CHAR_AMPERSAND=38,CHAR_SINGLE_QUOTE=39,CHAR_ASTERISK=42,CHAR_COMMA=44,CHAR_MINUS=45,CHAR_COLON=58,CHAR_GREATER_THAN=62,CHAR_QUESTION=63,CHAR_COMMERCIAL_AT=64,CHAR_LEFT_SQUARE_BRACKET=91,CHAR_RIGHT_SQUARE_BRACKET=93,CHAR_GRAVE_ACCENT=96,CHAR_LEFT_CURLY_BRACKET=123,CHAR_VERTICAL_LINE=124,CHAR_RIGHT_CURLY_BRACKET=125,ESCAPE_SEQUENCES={};ESCAPE_SEQUENCES[0]="\\0",ESCAPE_SEQUENCES[7]="\\a",ESCAPE_SEQUENCES[8]="\\b",ESCAPE_SEQUENCES[9]="\\t",ESCAPE_SEQUENCES[10]="\\n",ESCAPE_SEQUENCES[11]="\\v",ESCAPE_SEQUENCES[12]="\\f",ESCAPE_SEQUENCES[13]="\\r",ESCAPE_SEQUENCES[27]="\\e",ESCAPE_SEQUENCES[34]='\\"',ESCAPE_SEQUENCES[92]="\\\\",ESCAPE_SEQUENCES[133]="\\N",ESCAPE_SEQUENCES[160]="\\_",ESCAPE_SEQUENCES[8232]="\\L",ESCAPE_SEQUENCES[8233]="\\P";var DEPRECATED_BOOLEANS_SYNTAX=["y","Y","yes","Yes","YES","on","On","ON","n","N","no","No","NO","off","Off","OFF"];StringBuilder.prototype.takeUpTo=function(e){var t;if(e<this.checkpoint)throw t=new Error("position should be > checkpoint"),t.position=e,t.checkpoint=this.checkpoint,t;return this.result+=this.source.slice(this.checkpoint,e),this.checkpoint=e,this},StringBuilder.prototype.escapeChar=function(){var e,t;return e=this.source.charCodeAt(this.checkpoint),t=ESCAPE_SEQUENCES[e]||encodeHex(e),this.result+=t,this.checkpoint+=1,this},StringBuilder.prototype.finish=function(){this.source.length>this.checkpoint&&this.takeUpTo(this.source.length)},module.exports.dump=dump,module.exports.safeDump=safeDump;

},{"./common":14,"./exception":16,"./schema/default_full":21,"./schema/default_safe":22}],16:[function(require,module,exports){
"use strict";function YAMLException(t,n){this.name="YAMLException",this.reason=t,this.mark=n,this.message=this.toString(!1)}YAMLException.prototype.toString=function(t){var n;return n="JS-YAML: "+(this.reason||"(unknown reason)"),!t&&this.mark&&(n+=" "+this.mark.toString()),n},module.exports=YAMLException;

},{}],17:[function(require,module,exports){
"use strict";function is_EOL(e){return 10===e||13===e}function is_WHITE_SPACE(e){return 9===e||32===e}function is_WS_OR_EOL(e){return 9===e||32===e||10===e||13===e}function is_FLOW_INDICATOR(e){return 44===e||91===e||93===e||123===e||125===e}function fromHexCode(e){var t;return e>=48&&57>=e?e-48:(t=32|e,t>=97&&102>=t?t-97+10:-1)}function escapedHexLen(e){return 120===e?2:117===e?4:85===e?8:0}function fromDecimalCode(e){return e>=48&&57>=e?e-48:-1}function simpleEscapeSequence(e){return 48===e?"\x00":97===e?"":98===e?"\b":116===e?"	":9===e?"	":110===e?"\n":118===e?"":102===e?"\f":114===e?"\r":101===e?"":32===e?" ":34===e?'"':47===e?"/":92===e?"\\":78===e?"":95===e?" ":76===e?"\u2028":80===e?"\u2029":""}function charFromCodepoint(e){return 65535>=e?String.fromCharCode(e):String.fromCharCode((e-65536>>10)+55296,(e-65536&1023)+56320)}function State(e,t){this.input=e,this.filename=t.filename||null,this.schema=t.schema||DEFAULT_FULL_SCHEMA,this.onWarning=t.onWarning||null,this.legacy=t.legacy||!1,this.implicitTypes=this.schema.compiledImplicit,this.typeMap=this.schema.compiledTypeMap,this.length=e.length,this.position=0,this.line=0,this.lineStart=0,this.lineIndent=0,this.documents=[]}function generateError(e,t){return new YAMLException(t,new Mark(e.filename,e.input,e.position,e.line,e.position-e.lineStart))}function throwError(e,t){throw generateError(e,t)}function throwWarning(e,t){var n=generateError(e,t);if(!e.onWarning)throw n;e.onWarning.call(null,n)}function captureSegment(e,t,n,i){var o,r,a,p;if(n>t){if(p=e.input.slice(t,n),i)for(o=0,r=p.length;r>o;o+=1)a=p.charCodeAt(o),9===a||a>=32&&1114111>=a||throwError(e,"expected valid JSON character");e.result+=p}}function mergeMappings(e,t,n){var i,o,r,a;for(common.isObject(n)||throwError(e,"cannot merge mappings; the provided source object is unacceptable"),i=Object.keys(n),r=0,a=i.length;a>r;r+=1)o=i[r],_hasOwnProperty.call(t,o)||(t[o]=n[o])}function storeMappingPair(e,t,n,i,o){var r,a;if(i=String(i),null===t&&(t={}),"tag:yaml.org,2002:merge"===n)if(Array.isArray(o))for(r=0,a=o.length;a>r;r+=1)mergeMappings(e,t,o[r]);else mergeMappings(e,t,o);else t[i]=o;return t}function readLineBreak(e){var t;t=e.input.charCodeAt(e.position),10===t?e.position++:13===t?(e.position++,10===e.input.charCodeAt(e.position)&&e.position++):throwError(e,"a line break is expected"),e.line+=1,e.lineStart=e.position}function skipSeparationSpace(e,t,n){for(var i=0,o=e.input.charCodeAt(e.position);0!==o;){for(;is_WHITE_SPACE(o);)o=e.input.charCodeAt(++e.position);if(t&&35===o)do o=e.input.charCodeAt(++e.position);while(10!==o&&13!==o&&0!==o);if(!is_EOL(o))break;for(readLineBreak(e),o=e.input.charCodeAt(e.position),i++,e.lineIndent=0;32===o;)e.lineIndent++,o=e.input.charCodeAt(++e.position)}return-1!==n&&0!==i&&e.lineIndent<n&&throwWarning(e,"deficient indentation"),i}function testDocumentSeparator(e){var t,n=e.position;return t=e.input.charCodeAt(n),45!==t&&46!==t||e.input.charCodeAt(n+1)!==t||e.input.charCodeAt(n+2)!==t||(n+=3,t=e.input.charCodeAt(n),0!==t&&!is_WS_OR_EOL(t))?!1:!0}function writeFoldedLines(e,t){1===t?e.result+=" ":t>1&&(e.result+=common.repeat("\n",t-1))}function readPlainScalar(e,t,n){var i,o,r,a,p,s,c,l,u,d=e.kind,h=e.result;if(u=e.input.charCodeAt(e.position),is_WS_OR_EOL(u)||is_FLOW_INDICATOR(u)||35===u||38===u||42===u||33===u||124===u||62===u||39===u||34===u||37===u||64===u||96===u)return!1;if((63===u||45===u)&&(o=e.input.charCodeAt(e.position+1),is_WS_OR_EOL(o)||n&&is_FLOW_INDICATOR(o)))return!1;for(e.kind="scalar",e.result="",r=a=e.position,p=!1;0!==u;){if(58===u){if(o=e.input.charCodeAt(e.position+1),is_WS_OR_EOL(o)||n&&is_FLOW_INDICATOR(o))break}else if(35===u){if(i=e.input.charCodeAt(e.position-1),is_WS_OR_EOL(i))break}else{if(e.position===e.lineStart&&testDocumentSeparator(e)||n&&is_FLOW_INDICATOR(u))break;if(is_EOL(u)){if(s=e.line,c=e.lineStart,l=e.lineIndent,skipSeparationSpace(e,!1,-1),e.lineIndent>=t){p=!0,u=e.input.charCodeAt(e.position);continue}e.position=a,e.line=s,e.lineStart=c,e.lineIndent=l;break}}p&&(captureSegment(e,r,a,!1),writeFoldedLines(e,e.line-s),r=a=e.position,p=!1),is_WHITE_SPACE(u)||(a=e.position+1),u=e.input.charCodeAt(++e.position)}return captureSegment(e,r,a,!1),e.result?!0:(e.kind=d,e.result=h,!1)}function readSingleQuotedScalar(e,t){var n,i,o;if(n=e.input.charCodeAt(e.position),39!==n)return!1;for(e.kind="scalar",e.result="",e.position++,i=o=e.position;0!==(n=e.input.charCodeAt(e.position));)if(39===n){if(captureSegment(e,i,e.position,!0),n=e.input.charCodeAt(++e.position),39!==n)return!0;i=o=e.position,e.position++}else is_EOL(n)?(captureSegment(e,i,o,!0),writeFoldedLines(e,skipSeparationSpace(e,!1,t)),i=o=e.position):e.position===e.lineStart&&testDocumentSeparator(e)?throwError(e,"unexpected end of the document within a single quoted scalar"):(e.position++,o=e.position);throwError(e,"unexpected end of the stream within a single quoted scalar")}function readDoubleQuotedScalar(e,t){var n,i,o,r,a,p;if(p=e.input.charCodeAt(e.position),34!==p)return!1;for(e.kind="scalar",e.result="",e.position++,n=i=e.position;0!==(p=e.input.charCodeAt(e.position));){if(34===p)return captureSegment(e,n,e.position,!0),e.position++,!0;if(92===p){if(captureSegment(e,n,e.position,!0),p=e.input.charCodeAt(++e.position),is_EOL(p))skipSeparationSpace(e,!1,t);else if(256>p&&simpleEscapeCheck[p])e.result+=simpleEscapeMap[p],e.position++;else if((a=escapedHexLen(p))>0){for(o=a,r=0;o>0;o--)p=e.input.charCodeAt(++e.position),(a=fromHexCode(p))>=0?r=(r<<4)+a:throwError(e,"expected hexadecimal character");e.result+=charFromCodepoint(r),e.position++}else throwError(e,"unknown escape sequence");n=i=e.position}else is_EOL(p)?(captureSegment(e,n,i,!0),writeFoldedLines(e,skipSeparationSpace(e,!1,t)),n=i=e.position):e.position===e.lineStart&&testDocumentSeparator(e)?throwError(e,"unexpected end of the document within a double quoted scalar"):(e.position++,i=e.position)}throwError(e,"unexpected end of the stream within a double quoted scalar")}function readFlowCollection(e,t){var n,i,o,r,a,p,s,c,l,u,d,h=!0,f=e.tag,_=e.anchor;if(d=e.input.charCodeAt(e.position),91===d)r=93,s=!1,i=[];else{if(123!==d)return!1;r=125,s=!0,i={}}for(null!==e.anchor&&(e.anchorMap[e.anchor]=i),d=e.input.charCodeAt(++e.position);0!==d;){if(skipSeparationSpace(e,!0,t),d=e.input.charCodeAt(e.position),d===r)return e.position++,e.tag=f,e.anchor=_,e.kind=s?"mapping":"sequence",e.result=i,!0;h||throwError(e,"missed comma between flow collection entries"),l=c=u=null,a=p=!1,63===d&&(o=e.input.charCodeAt(e.position+1),is_WS_OR_EOL(o)&&(a=p=!0,e.position++,skipSeparationSpace(e,!0,t))),n=e.line,composeNode(e,t,CONTEXT_FLOW_IN,!1,!0),l=e.tag,c=e.result,skipSeparationSpace(e,!0,t),d=e.input.charCodeAt(e.position),!p&&e.line!==n||58!==d||(a=!0,d=e.input.charCodeAt(++e.position),skipSeparationSpace(e,!0,t),composeNode(e,t,CONTEXT_FLOW_IN,!1,!0),u=e.result),s?storeMappingPair(e,i,l,c,u):a?i.push(storeMappingPair(e,null,l,c,u)):i.push(c),skipSeparationSpace(e,!0,t),d=e.input.charCodeAt(e.position),44===d?(h=!0,d=e.input.charCodeAt(++e.position)):h=!1}throwError(e,"unexpected end of the stream within a flow collection")}function readBlockScalar(e,t){var n,i,o,r,a=CHOMPING_CLIP,p=!1,s=t,c=0,l=!1;if(r=e.input.charCodeAt(e.position),124===r)i=!1;else{if(62!==r)return!1;i=!0}for(e.kind="scalar",e.result="";0!==r;)if(r=e.input.charCodeAt(++e.position),43===r||45===r)CHOMPING_CLIP===a?a=43===r?CHOMPING_KEEP:CHOMPING_STRIP:throwError(e,"repeat of a chomping mode identifier");else{if(!((o=fromDecimalCode(r))>=0))break;0===o?throwError(e,"bad explicit indentation width of a block scalar; it cannot be less than one"):p?throwError(e,"repeat of an indentation width identifier"):(s=t+o-1,p=!0)}if(is_WHITE_SPACE(r)){do r=e.input.charCodeAt(++e.position);while(is_WHITE_SPACE(r));if(35===r)do r=e.input.charCodeAt(++e.position);while(!is_EOL(r)&&0!==r)}for(;0!==r;){for(readLineBreak(e),e.lineIndent=0,r=e.input.charCodeAt(e.position);(!p||e.lineIndent<s)&&32===r;)e.lineIndent++,r=e.input.charCodeAt(++e.position);if(!p&&e.lineIndent>s&&(s=e.lineIndent),is_EOL(r))c++;else{if(e.lineIndent<s){a===CHOMPING_KEEP?e.result+=common.repeat("\n",c):a===CHOMPING_CLIP&&p&&(e.result+="\n");break}for(i?is_WHITE_SPACE(r)?(l=!0,e.result+=common.repeat("\n",c+1)):l?(l=!1,e.result+=common.repeat("\n",c+1)):0===c?p&&(e.result+=" "):e.result+=common.repeat("\n",c):p&&(e.result+=common.repeat("\n",c+1)),p=!0,c=0,n=e.position;!is_EOL(r)&&0!==r;)r=e.input.charCodeAt(++e.position);captureSegment(e,n,e.position,!1)}}return!0}function readBlockSequence(e,t){var n,i,o,r=e.tag,a=e.anchor,p=[],s=!1;for(null!==e.anchor&&(e.anchorMap[e.anchor]=p),o=e.input.charCodeAt(e.position);0!==o&&45===o&&(i=e.input.charCodeAt(e.position+1),is_WS_OR_EOL(i));)if(s=!0,e.position++,skipSeparationSpace(e,!0,-1)&&e.lineIndent<=t)p.push(null),o=e.input.charCodeAt(e.position);else if(n=e.line,composeNode(e,t,CONTEXT_BLOCK_IN,!1,!0),p.push(e.result),skipSeparationSpace(e,!0,-1),o=e.input.charCodeAt(e.position),(e.line===n||e.lineIndent>t)&&0!==o)throwError(e,"bad indentation of a sequence entry");else if(e.lineIndent<t)break;return s?(e.tag=r,e.anchor=a,e.kind="sequence",e.result=p,!0):!1}function readBlockMapping(e,t,n){var i,o,r,a,p=e.tag,s=e.anchor,c={},l=null,u=null,d=null,h=!1,f=!1;for(null!==e.anchor&&(e.anchorMap[e.anchor]=c),a=e.input.charCodeAt(e.position);0!==a;){if(i=e.input.charCodeAt(e.position+1),r=e.line,63!==a&&58!==a||!is_WS_OR_EOL(i)){if(!composeNode(e,n,CONTEXT_FLOW_OUT,!1,!0))break;if(e.line===r){for(a=e.input.charCodeAt(e.position);is_WHITE_SPACE(a);)a=e.input.charCodeAt(++e.position);if(58===a)a=e.input.charCodeAt(++e.position),is_WS_OR_EOL(a)||throwError(e,"a whitespace character is expected after the key-value separator within a block mapping"),h&&(storeMappingPair(e,c,l,u,null),l=u=d=null),f=!0,h=!1,o=!1,l=e.tag,u=e.result;else{if(!f)return e.tag=p,e.anchor=s,!0;throwError(e,"can not read an implicit mapping pair; a colon is missed")}}else{if(!f)return e.tag=p,e.anchor=s,!0;throwError(e,"can not read a block mapping entry; a multiline key may not be an implicit key")}}else 63===a?(h&&(storeMappingPair(e,c,l,u,null),l=u=d=null),f=!0,h=!0,o=!0):h?(h=!1,o=!0):throwError(e,"incomplete explicit mapping pair; a key node is missed"),e.position+=1,a=i;if((e.line===r||e.lineIndent>t)&&(composeNode(e,t,CONTEXT_BLOCK_OUT,!0,o)&&(h?u=e.result:d=e.result),h||(storeMappingPair(e,c,l,u,d),l=u=d=null),skipSeparationSpace(e,!0,-1),a=e.input.charCodeAt(e.position)),e.lineIndent>t&&0!==a)throwError(e,"bad indentation of a mapping entry");else if(e.lineIndent<t)break}return h&&storeMappingPair(e,c,l,u,null),f&&(e.tag=p,e.anchor=s,e.kind="mapping",e.result=c),f}function readTagProperty(e){var t,n,i,o,r=!1,a=!1;if(o=e.input.charCodeAt(e.position),33!==o)return!1;if(null!==e.tag&&throwError(e,"duplication of a tag property"),o=e.input.charCodeAt(++e.position),60===o?(r=!0,o=e.input.charCodeAt(++e.position)):33===o?(a=!0,n="!!",o=e.input.charCodeAt(++e.position)):n="!",t=e.position,r){do o=e.input.charCodeAt(++e.position);while(0!==o&&62!==o);e.position<e.length?(i=e.input.slice(t,e.position),o=e.input.charCodeAt(++e.position)):throwError(e,"unexpected end of the stream within a verbatim tag")}else{for(;0!==o&&!is_WS_OR_EOL(o);)33===o&&(a?throwError(e,"tag suffix cannot contain exclamation marks"):(n=e.input.slice(t-1,e.position+1),PATTERN_TAG_HANDLE.test(n)||throwError(e,"named tag handle cannot contain such characters"),a=!0,t=e.position+1)),o=e.input.charCodeAt(++e.position);i=e.input.slice(t,e.position),PATTERN_FLOW_INDICATORS.test(i)&&throwError(e,"tag suffix cannot contain flow indicator characters")}return i&&!PATTERN_TAG_URI.test(i)&&throwError(e,"tag name cannot contain such characters: "+i),r?e.tag=i:_hasOwnProperty.call(e.tagMap,n)?e.tag=e.tagMap[n]+i:"!"===n?e.tag="!"+i:"!!"===n?e.tag="tag:yaml.org,2002:"+i:throwError(e,'undeclared tag handle "'+n+'"'),!0}function readAnchorProperty(e){var t,n;if(n=e.input.charCodeAt(e.position),38!==n)return!1;for(null!==e.anchor&&throwError(e,"duplication of an anchor property"),n=e.input.charCodeAt(++e.position),t=e.position;0!==n&&!is_WS_OR_EOL(n)&&!is_FLOW_INDICATOR(n);)n=e.input.charCodeAt(++e.position);return e.position===t&&throwError(e,"name of an anchor node must contain at least one character"),e.anchor=e.input.slice(t,e.position),!0}function readAlias(e){var t,n,i;e.length,e.input;if(i=e.input.charCodeAt(e.position),42!==i)return!1;for(i=e.input.charCodeAt(++e.position),t=e.position;0!==i&&!is_WS_OR_EOL(i)&&!is_FLOW_INDICATOR(i);)i=e.input.charCodeAt(++e.position);return e.position===t&&throwError(e,"name of an alias node must contain at least one character"),n=e.input.slice(t,e.position),e.anchorMap.hasOwnProperty(n)||throwError(e,'unidentified alias "'+n+'"'),e.result=e.anchorMap[n],skipSeparationSpace(e,!0,-1),!0}function composeNode(e,t,n,i,o){var r,a,p,s,c,l,u,d,h=1,f=!1,_=!1;if(e.tag=null,e.anchor=null,e.kind=null,e.result=null,r=a=p=CONTEXT_BLOCK_OUT===n||CONTEXT_BLOCK_IN===n,i&&skipSeparationSpace(e,!0,-1)&&(f=!0,e.lineIndent>t?h=1:e.lineIndent===t?h=0:e.lineIndent<t&&(h=-1)),1===h)for(;readTagProperty(e)||readAnchorProperty(e);)skipSeparationSpace(e,!0,-1)?(f=!0,p=r,e.lineIndent>t?h=1:e.lineIndent===t?h=0:e.lineIndent<t&&(h=-1)):p=!1;if(p&&(p=f||o),(1===h||CONTEXT_BLOCK_OUT===n)&&(u=CONTEXT_FLOW_IN===n||CONTEXT_FLOW_OUT===n?t:t+1,d=e.position-e.lineStart,1===h?p&&(readBlockSequence(e,d)||readBlockMapping(e,d,u))||readFlowCollection(e,u)?_=!0:(a&&readBlockScalar(e,u)||readSingleQuotedScalar(e,u)||readDoubleQuotedScalar(e,u)?_=!0:readAlias(e)?(_=!0,(null!==e.tag||null!==e.anchor)&&throwError(e,"alias node should not have any properties")):readPlainScalar(e,u,CONTEXT_FLOW_IN===n)&&(_=!0,null===e.tag&&(e.tag="?")),null!==e.anchor&&(e.anchorMap[e.anchor]=e.result)):0===h&&(_=p&&readBlockSequence(e,d))),null!==e.tag&&"!"!==e.tag)if("?"===e.tag){for(s=0,c=e.implicitTypes.length;c>s;s+=1)if(l=e.implicitTypes[s],l.resolve(e.result)){e.result=l.construct(e.result),e.tag=l.tag,null!==e.anchor&&(e.anchorMap[e.anchor]=e.result);break}}else _hasOwnProperty.call(e.typeMap,e.tag)?(l=e.typeMap[e.tag],null!==e.result&&l.kind!==e.kind&&throwError(e,"unacceptable node kind for !<"+e.tag+'> tag; it should be "'+l.kind+'", not "'+e.kind+'"'),l.resolve(e.result)?(e.result=l.construct(e.result),null!==e.anchor&&(e.anchorMap[e.anchor]=e.result)):throwError(e,"cannot resolve a node with !<"+e.tag+"> explicit tag")):throwWarning(e,"unknown tag !<"+e.tag+">");return null!==e.tag||null!==e.anchor||_}function readDocument(e){var t,n,i,o,r=e.position,a=!1;for(e.version=null,e.checkLineBreaks=e.legacy,e.tagMap={},e.anchorMap={};0!==(o=e.input.charCodeAt(e.position))&&(skipSeparationSpace(e,!0,-1),o=e.input.charCodeAt(e.position),!(e.lineIndent>0||37!==o));){for(a=!0,o=e.input.charCodeAt(++e.position),t=e.position;0!==o&&!is_WS_OR_EOL(o);)o=e.input.charCodeAt(++e.position);for(n=e.input.slice(t,e.position),i=[],n.length<1&&throwError(e,"directive name must not be less than one character in length");0!==o;){for(;is_WHITE_SPACE(o);)o=e.input.charCodeAt(++e.position);if(35===o){do o=e.input.charCodeAt(++e.position);while(0!==o&&!is_EOL(o));break}if(is_EOL(o))break;for(t=e.position;0!==o&&!is_WS_OR_EOL(o);)o=e.input.charCodeAt(++e.position);i.push(e.input.slice(t,e.position))}0!==o&&readLineBreak(e),_hasOwnProperty.call(directiveHandlers,n)?directiveHandlers[n](e,n,i):throwWarning(e,'unknown document directive "'+n+'"')}return skipSeparationSpace(e,!0,-1),0===e.lineIndent&&45===e.input.charCodeAt(e.position)&&45===e.input.charCodeAt(e.position+1)&&45===e.input.charCodeAt(e.position+2)?(e.position+=3,skipSeparationSpace(e,!0,-1)):a&&throwError(e,"directives end mark is expected"),composeNode(e,e.lineIndent-1,CONTEXT_BLOCK_OUT,!1,!0),skipSeparationSpace(e,!0,-1),e.checkLineBreaks&&PATTERN_NON_ASCII_LINE_BREAKS.test(e.input.slice(r,e.position))&&throwWarning(e,"non-ASCII line breaks are interpreted as content"),e.documents.push(e.result),e.position===e.lineStart&&testDocumentSeparator(e)?void(46===e.input.charCodeAt(e.position)&&(e.position+=3,skipSeparationSpace(e,!0,-1))):void(e.position<e.length-1&&throwError(e,"end of the stream or a document separator is expected"))}function loadDocuments(e,t){e=String(e),t=t||{},0!==e.length&&(10!==e.charCodeAt(e.length-1)&&13!==e.charCodeAt(e.length-1)&&(e+="\n"),65279===e.charCodeAt(0)&&(e=e.slice(1)));var n=new State(e,t);for(PATTERN_NON_PRINTABLE.test(n.input)&&throwError(n,"the stream contains non-printable characters"),n.input+="\x00";32===n.input.charCodeAt(n.position);)n.lineIndent+=1,n.position+=1;for(;n.position<n.length-1;)readDocument(n);return n.documents}function loadAll(e,t,n){var i,o,r=loadDocuments(e,n);for(i=0,o=r.length;o>i;i+=1)t(r[i])}function load(e,t){var n=loadDocuments(e,t);if(0===n.length)return void 0;if(1===n.length)return n[0];throw new YAMLException("expected a single document in the stream, but found more")}function safeLoadAll(e,t,n){loadAll(e,t,common.extend({schema:DEFAULT_SAFE_SCHEMA},n))}function safeLoad(e,t){return load(e,common.extend({schema:DEFAULT_SAFE_SCHEMA},t))}for(var common=require("./common"),YAMLException=require("./exception"),Mark=require("./mark"),DEFAULT_SAFE_SCHEMA=require("./schema/default_safe"),DEFAULT_FULL_SCHEMA=require("./schema/default_full"),_hasOwnProperty=Object.prototype.hasOwnProperty,CONTEXT_FLOW_IN=1,CONTEXT_FLOW_OUT=2,CONTEXT_BLOCK_IN=3,CONTEXT_BLOCK_OUT=4,CHOMPING_CLIP=1,CHOMPING_STRIP=2,CHOMPING_KEEP=3,PATTERN_NON_PRINTABLE=/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/,PATTERN_NON_ASCII_LINE_BREAKS=/[\x85\u2028\u2029]/,PATTERN_FLOW_INDICATORS=/[,\[\]\{\}]/,PATTERN_TAG_HANDLE=/^(?:!|!!|![a-z\-]+!)$/i,PATTERN_TAG_URI=/^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i,simpleEscapeCheck=new Array(256),simpleEscapeMap=new Array(256),i=0;256>i;i++)simpleEscapeCheck[i]=simpleEscapeSequence(i)?1:0,simpleEscapeMap[i]=simpleEscapeSequence(i);var directiveHandlers={YAML:function(e,t,n){var i,o,r;null!==e.version&&throwError(e,"duplication of %YAML directive"),1!==n.length&&throwError(e,"YAML directive accepts exactly one argument"),i=/^([0-9]+)\.([0-9]+)$/.exec(n[0]),null===i&&throwError(e,"ill-formed argument of the YAML directive"),o=parseInt(i[1],10),r=parseInt(i[2],10),1!==o&&throwError(e,"unacceptable YAML version of the document"),e.version=n[0],e.checkLineBreaks=2>r,1!==r&&2!==r&&throwWarning(e,"unsupported YAML version of the document")},TAG:function(e,t,n){var i,o;2!==n.length&&throwError(e,"TAG directive accepts exactly two arguments"),i=n[0],o=n[1],PATTERN_TAG_HANDLE.test(i)||throwError(e,"ill-formed tag handle (first argument) of the TAG directive"),_hasOwnProperty.call(e.tagMap,i)&&throwError(e,'there is a previously declared suffix for "'+i+'" tag handle'),PATTERN_TAG_URI.test(o)||throwError(e,"ill-formed tag prefix (second argument) of the TAG directive"),e.tagMap[i]=o}};module.exports.loadAll=loadAll,module.exports.load=load,module.exports.safeLoadAll=safeLoadAll,module.exports.safeLoad=safeLoad;

},{"./common":14,"./exception":16,"./mark":18,"./schema/default_full":21,"./schema/default_safe":22}],18:[function(require,module,exports){
"use strict";function Mark(t,i,n,e,r){this.name=t,this.buffer=i,this.position=n,this.line=e,this.column=r}var common=require("./common");Mark.prototype.getSnippet=function(t,i){var n,e,r,o,s;if(!this.buffer)return null;for(t=t||4,i=i||75,n="",e=this.position;e>0&&-1==="\x00\r\n\u2028\u2029".indexOf(this.buffer.charAt(e-1));)if(e-=1,this.position-e>i/2-1){n=" ... ",e+=5;break}for(r="",o=this.position;o<this.buffer.length&&-1==="\x00\r\n\u2028\u2029".indexOf(this.buffer.charAt(o));)if(o+=1,o-this.position>i/2-1){r=" ... ",o-=5;break}return s=this.buffer.slice(e,o),common.repeat(" ",t)+n+s+r+"\n"+common.repeat(" ",t+this.position-e+n.length)+"^"},Mark.prototype.toString=function(t){var i,n="";return this.name&&(n+='in "'+this.name+'" '),n+="at line "+(this.line+1)+", column "+(this.column+1),t||(i=this.getSnippet(),i&&(n+=":\n"+i)),n},module.exports=Mark;

},{"./common":14}],19:[function(require,module,exports){
"use strict";function compileList(i,e,t){var c=[];return i.include.forEach(function(i){t=compileList(i,e,t)}),i[e].forEach(function(i){t.forEach(function(e,t){e.tag===i.tag&&c.push(t)}),t.push(i)}),t.filter(function(i,e){return-1===c.indexOf(e)})}function compileMap(){function i(i){c[i.tag]=i}var e,t,c={};for(e=0,t=arguments.length;t>e;e+=1)arguments[e].forEach(i);return c}function Schema(i){this.include=i.include||[],this.implicit=i.implicit||[],this.explicit=i.explicit||[],this.implicit.forEach(function(i){if(i.loadKind&&"scalar"!==i.loadKind)throw new YAMLException("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.")}),this.compiledImplicit=compileList(this,"implicit",[]),this.compiledExplicit=compileList(this,"explicit",[]),this.compiledTypeMap=compileMap(this.compiledImplicit,this.compiledExplicit)}var common=require("./common"),YAMLException=require("./exception"),Type=require("./type");Schema.DEFAULT=null,Schema.create=function(){var i,e;switch(arguments.length){case 1:i=Schema.DEFAULT,e=arguments[0];break;case 2:i=arguments[0],e=arguments[1];break;default:throw new YAMLException("Wrong number of arguments for Schema.create function")}if(i=common.toArray(i),e=common.toArray(e),!i.every(function(i){return i instanceof Schema}))throw new YAMLException("Specified list of super schemas (or a single Schema object) contains a non-Schema object.");if(!e.every(function(i){return i instanceof Type}))throw new YAMLException("Specified list of YAML types (or a single Type object) contains a non-Type object.");return new Schema({include:i,explicit:e})},module.exports=Schema;

},{"./common":14,"./exception":16,"./type":25}],20:[function(require,module,exports){
"use strict";var Schema=require("../schema");module.exports=new Schema({include:[require("./json")]});

},{"../schema":19,"./json":24}],21:[function(require,module,exports){
"use strict";var Schema=require("../schema");module.exports=Schema.DEFAULT=new Schema({include:[require("./default_safe")],explicit:[require("../type/js/undefined"),require("../type/js/regexp"),require("../type/js/function")]});

},{"../schema":19,"../type/js/function":30,"../type/js/regexp":31,"../type/js/undefined":32,"./default_safe":22}],22:[function(require,module,exports){
"use strict";var Schema=require("../schema");module.exports=new Schema({include:[require("./core")],implicit:[require("../type/timestamp"),require("../type/merge")],explicit:[require("../type/binary"),require("../type/omap"),require("../type/pairs"),require("../type/set")]});

},{"../schema":19,"../type/binary":26,"../type/merge":34,"../type/omap":36,"../type/pairs":37,"../type/set":39,"../type/timestamp":41,"./core":20}],23:[function(require,module,exports){
"use strict";var Schema=require("../schema");module.exports=new Schema({explicit:[require("../type/str"),require("../type/seq"),require("../type/map")]});

},{"../schema":19,"../type/map":33,"../type/seq":38,"../type/str":40}],24:[function(require,module,exports){
"use strict";var Schema=require("../schema");module.exports=new Schema({include:[require("./failsafe")],implicit:[require("../type/null"),require("../type/bool"),require("../type/int"),require("../type/float")]});

},{"../schema":19,"../type/bool":27,"../type/float":28,"../type/int":29,"../type/null":35,"./failsafe":23}],25:[function(require,module,exports){
"use strict";function compileStyleAliases(e){var t={};return null!==e&&Object.keys(e).forEach(function(n){e[n].forEach(function(e){t[String(e)]=n})}),t}function Type(e,t){if(t=t||{},Object.keys(t).forEach(function(t){if(-1===TYPE_CONSTRUCTOR_OPTIONS.indexOf(t))throw new YAMLException('Unknown option "'+t+'" is met in definition of "'+e+'" YAML type.')}),this.tag=e,this.kind=t.kind||null,this.resolve=t.resolve||function(){return!0},this.construct=t.construct||function(e){return e},this.instanceOf=t.instanceOf||null,this.predicate=t.predicate||null,this.represent=t.represent||null,this.defaultStyle=t.defaultStyle||null,this.styleAliases=compileStyleAliases(t.styleAliases||null),-1===YAML_NODE_KINDS.indexOf(this.kind))throw new YAMLException('Unknown kind "'+this.kind+'" is specified for "'+e+'" YAML type.')}var YAMLException=require("./exception"),TYPE_CONSTRUCTOR_OPTIONS=["kind","resolve","construct","instanceOf","predicate","represent","defaultStyle","styleAliases"],YAML_NODE_KINDS=["scalar","sequence","mapping"];module.exports=Type;

},{"./exception":16}],26:[function(require,module,exports){
"use strict";function resolveYamlBinary(r){if(null===r)return!1;var e,n,u=0,t=r.length,f=BASE64_MAP;for(n=0;t>n;n++)if(e=f.indexOf(r.charAt(n)),!(e>64)){if(0>e)return!1;u+=6}return u%8===0}function constructYamlBinary(r){var e,n,u=r.replace(/[\r\n=]/g,""),t=u.length,f=BASE64_MAP,a=0,i=[];for(e=0;t>e;e++)e%4===0&&e&&(i.push(a>>16&255),i.push(a>>8&255),i.push(255&a)),a=a<<6|f.indexOf(u.charAt(e));return n=t%4*6,0===n?(i.push(a>>16&255),i.push(a>>8&255),i.push(255&a)):18===n?(i.push(a>>10&255),i.push(a>>2&255)):12===n&&i.push(a>>4&255),NodeBuffer?new NodeBuffer(i):i}function representYamlBinary(r){var e,n,u="",t=0,f=r.length,a=BASE64_MAP;for(e=0;f>e;e++)e%3===0&&e&&(u+=a[t>>18&63],u+=a[t>>12&63],u+=a[t>>6&63],u+=a[63&t]),t=(t<<8)+r[e];return n=f%3,0===n?(u+=a[t>>18&63],u+=a[t>>12&63],u+=a[t>>6&63],u+=a[63&t]):2===n?(u+=a[t>>10&63],u+=a[t>>4&63],u+=a[t<<2&63],u+=a[64]):1===n&&(u+=a[t>>2&63],u+=a[t<<4&63],u+=a[64],u+=a[64]),u}function isBinary(r){return NodeBuffer&&NodeBuffer.isBuffer(r)}var NodeBuffer=require("buffer").Buffer,Type=require("../type"),BASE64_MAP="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";module.exports=new Type("tag:yaml.org,2002:binary",{kind:"scalar",resolve:resolveYamlBinary,construct:constructYamlBinary,predicate:isBinary,represent:representYamlBinary});

},{"../type":25,"buffer":5}],27:[function(require,module,exports){
"use strict";function resolveYamlBoolean(e){if(null===e)return!1;var r=e.length;return 4===r&&("true"===e||"True"===e||"TRUE"===e)||5===r&&("false"===e||"False"===e||"FALSE"===e)}function constructYamlBoolean(e){return"true"===e||"True"===e||"TRUE"===e}function isBoolean(e){return"[object Boolean]"===Object.prototype.toString.call(e)}var Type=require("../type");module.exports=new Type("tag:yaml.org,2002:bool",{kind:"scalar",resolve:resolveYamlBoolean,construct:constructYamlBoolean,predicate:isBoolean,represent:{lowercase:function(e){return e?"true":"false"},uppercase:function(e){return e?"TRUE":"FALSE"},camelcase:function(e){return e?"True":"False"}},defaultStyle:"lowercase"});

},{"../type":25}],28:[function(require,module,exports){
"use strict";function resolveYamlFloat(e){if(null===e)return!1;return YAML_FLOAT_PATTERN.test(e)?!0:!1}function constructYamlFloat(e){var r,t,a,n;return r=e.replace(/_/g,"").toLowerCase(),t="-"===r[0]?-1:1,n=[],0<="+-".indexOf(r[0])&&(r=r.slice(1)),".inf"===r?1===t?Number.POSITIVE_INFINITY:Number.NEGATIVE_INFINITY:".nan"===r?NaN:0<=r.indexOf(":")?(r.split(":").forEach(function(e){n.unshift(parseFloat(e,10))}),r=0,a=1,n.forEach(function(e){r+=e*a,a*=60}),t*r):t*parseFloat(r,10)}function representYamlFloat(e,r){if(isNaN(e))switch(r){case"lowercase":return".nan";case"uppercase":return".NAN";case"camelcase":return".NaN"}else if(Number.POSITIVE_INFINITY===e)switch(r){case"lowercase":return".inf";case"uppercase":return".INF";case"camelcase":return".Inf"}else if(Number.NEGATIVE_INFINITY===e)switch(r){case"lowercase":return"-.inf";case"uppercase":return"-.INF";case"camelcase":return"-.Inf"}else if(common.isNegativeZero(e))return"-0.0";return e.toString(10)}function isFloat(e){return"[object Number]"===Object.prototype.toString.call(e)&&(0!==e%1||common.isNegativeZero(e))}var common=require("../common"),Type=require("../type"),YAML_FLOAT_PATTERN=new RegExp("^(?:[-+]?(?:[0-9][0-9_]*)\\.[0-9_]*(?:[eE][-+][0-9]+)?|\\.[0-9_]+(?:[eE][-+][0-9]+)?|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\\.[0-9_]*|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");module.exports=new Type("tag:yaml.org,2002:float",{kind:"scalar",resolve:resolveYamlFloat,construct:constructYamlFloat,predicate:isFloat,represent:representYamlFloat,defaultStyle:"lowercase"});

},{"../common":14,"../type":25}],29:[function(require,module,exports){
"use strict";function isHexCode(e){return e>=48&&57>=e||e>=65&&70>=e||e>=97&&102>=e}function isOctCode(e){return e>=48&&55>=e}function isDecCode(e){return e>=48&&57>=e}function resolveYamlInteger(e){if(null===e)return!1;var r,t=e.length,n=0,i=!1;if(!t)return!1;if(r=e[n],("-"===r||"+"===r)&&(r=e[++n]),"0"===r){if(n+1===t)return!0;if(r=e[++n],"b"===r){for(n++;t>n;n++)if(r=e[n],"_"!==r){if("0"!==r&&"1"!==r)return!1;i=!0}return i}if("x"===r){for(n++;t>n;n++)if(r=e[n],"_"!==r){if(!isHexCode(e.charCodeAt(n)))return!1;i=!0}return i}for(;t>n;n++)if(r=e[n],"_"!==r){if(!isOctCode(e.charCodeAt(n)))return!1;i=!0}return i}for(;t>n;n++)if(r=e[n],"_"!==r){if(":"===r)break;if(!isDecCode(e.charCodeAt(n)))return!1;i=!0}return i?":"!==r?!0:/^(:[0-5]?[0-9])+$/.test(e.slice(n)):!1}function constructYamlInteger(e){var r,t,n=e,i=1,o=[];return-1!==n.indexOf("_")&&(n=n.replace(/_/g,"")),r=n[0],("-"===r||"+"===r)&&("-"===r&&(i=-1),n=n.slice(1),r=n[0]),"0"===n?0:"0"===r?"b"===n[1]?i*parseInt(n.slice(2),2):"x"===n[1]?i*parseInt(n,16):i*parseInt(n,8):-1!==n.indexOf(":")?(n.split(":").forEach(function(e){o.unshift(parseInt(e,10))}),n=0,t=1,o.forEach(function(e){n+=e*t,t*=60}),i*n):i*parseInt(n,10)}function isInteger(e){return"[object Number]"===Object.prototype.toString.call(e)&&0===e%1&&!common.isNegativeZero(e)}var common=require("../common"),Type=require("../type");module.exports=new Type("tag:yaml.org,2002:int",{kind:"scalar",resolve:resolveYamlInteger,construct:constructYamlInteger,predicate:isInteger,represent:{binary:function(e){return"0b"+e.toString(2)},octal:function(e){return"0"+e.toString(8)},decimal:function(e){return e.toString(10)},hexadecimal:function(e){return"0x"+e.toString(16).toUpperCase()}},defaultStyle:"decimal",styleAliases:{binary:[2,"bin"],octal:[8,"oct"],decimal:[10,"dec"],hexadecimal:[16,"hex"]}});

},{"../common":14,"../type":25}],30:[function(require,module,exports){
"use strict";function resolveJavascriptFunction(e){if(null===e)return!1;try{var r="("+e+")",n=esprima.parse(r,{range:!0});return"Program"!==n.type||1!==n.body.length||"ExpressionStatement"!==n.body[0].type||"FunctionExpression"!==n.body[0].expression.type?!1:!0}catch(t){return!1}}function constructJavascriptFunction(e){var r,n="("+e+")",t=esprima.parse(n,{range:!0}),o=[];if("Program"!==t.type||1!==t.body.length||"ExpressionStatement"!==t.body[0].type||"FunctionExpression"!==t.body[0].expression.type)throw new Error("Failed to resolve function");return t.body[0].expression.params.forEach(function(e){o.push(e.name)}),r=t.body[0].expression.body.range,new Function(o,n.slice(r[0]+1,r[1]-1))}function representJavascriptFunction(e){return e.toString()}function isFunction(e){return"[object Function]"===Object.prototype.toString.call(e)}var esprima;try{esprima=require("esprima")}catch(_){"undefined"!=typeof window&&(esprima=window.esprima)}var Type=require("../../type");module.exports=new Type("tag:yaml.org,2002:js/function",{kind:"scalar",resolve:resolveJavascriptFunction,construct:constructJavascriptFunction,predicate:isFunction,represent:representJavascriptFunction});

},{"../../type":25,"esprima":42}],31:[function(require,module,exports){
"use strict";function resolveJavascriptRegExp(e){if(null===e)return!1;if(0===e.length)return!1;var r=e,t=/\/([gim]*)$/.exec(e),n="";if("/"===r[0]){if(t&&(n=t[1]),n.length>3)return!1;if("/"!==r[r.length-n.length-1])return!1;r=r.slice(1,r.length-n.length-1)}try{new RegExp(r,n);return!0}catch(i){return!1}}function constructJavascriptRegExp(e){var r=e,t=/\/([gim]*)$/.exec(e),n="";return"/"===r[0]&&(t&&(n=t[1]),r=r.slice(1,r.length-n.length-1)),new RegExp(r,n)}function representJavascriptRegExp(e){var r="/"+e.source+"/";return e.global&&(r+="g"),e.multiline&&(r+="m"),e.ignoreCase&&(r+="i"),r}function isRegExp(e){return"[object RegExp]"===Object.prototype.toString.call(e)}var Type=require("../../type");module.exports=new Type("tag:yaml.org,2002:js/regexp",{kind:"scalar",resolve:resolveJavascriptRegExp,construct:constructJavascriptRegExp,predicate:isRegExp,represent:representJavascriptRegExp});

},{"../../type":25}],32:[function(require,module,exports){
"use strict";function resolveJavascriptUndefined(){return!0}function constructJavascriptUndefined(){return void 0}function representJavascriptUndefined(){return""}function isUndefined(e){return"undefined"==typeof e}var Type=require("../../type");module.exports=new Type("tag:yaml.org,2002:js/undefined",{kind:"scalar",resolve:resolveJavascriptUndefined,construct:constructJavascriptUndefined,predicate:isUndefined,represent:representJavascriptUndefined});

},{"../../type":25}],33:[function(require,module,exports){
"use strict";var Type=require("../type");module.exports=new Type("tag:yaml.org,2002:map",{kind:"mapping",construct:function(e){return null!==e?e:{}}});

},{"../type":25}],34:[function(require,module,exports){
"use strict";function resolveYamlMerge(e){return"<<"===e||null===e}var Type=require("../type");module.exports=new Type("tag:yaml.org,2002:merge",{kind:"scalar",resolve:resolveYamlMerge});

},{"../type":25}],35:[function(require,module,exports){
"use strict";function resolveYamlNull(l){if(null===l)return!0;var e=l.length;return 1===e&&"~"===l||4===e&&("null"===l||"Null"===l||"NULL"===l)}function constructYamlNull(){return null}function isNull(l){return null===l}var Type=require("../type");module.exports=new Type("tag:yaml.org,2002:null",{kind:"scalar",resolve:resolveYamlNull,construct:constructYamlNull,predicate:isNull,represent:{canonical:function(){return"~"},lowercase:function(){return"null"},uppercase:function(){return"NULL"},camelcase:function(){return"Null"}},defaultStyle:"lowercase"});

},{"../type":25}],36:[function(require,module,exports){
"use strict";function resolveYamlOmap(r){if(null===r)return!0;var t,e,n,o,u,a=[],l=r;for(t=0,e=l.length;e>t;t+=1){if(n=l[t],u=!1,"[object Object]"!==_toString.call(n))return!1;for(o in n)if(_hasOwnProperty.call(n,o)){if(u)return!1;u=!0}if(!u)return!1;if(-1!==a.indexOf(o))return!1;a.push(o)}return!0}function constructYamlOmap(r){return null!==r?r:[]}var Type=require("../type"),_hasOwnProperty=Object.prototype.hasOwnProperty,_toString=Object.prototype.toString;module.exports=new Type("tag:yaml.org,2002:omap",{kind:"sequence",resolve:resolveYamlOmap,construct:constructYamlOmap});

},{"../type":25}],37:[function(require,module,exports){
"use strict";function resolveYamlPairs(r){if(null===r)return!0;var e,t,n,l,o,a=r;for(o=new Array(a.length),e=0,t=a.length;t>e;e+=1){if(n=a[e],"[object Object]"!==_toString.call(n))return!1;if(l=Object.keys(n),1!==l.length)return!1;o[e]=[l[0],n[l[0]]]}return!0}function constructYamlPairs(r){if(null===r)return[];var e,t,n,l,o,a=r;for(o=new Array(a.length),e=0,t=a.length;t>e;e+=1)n=a[e],l=Object.keys(n),o[e]=[l[0],n[l[0]]];return o}var Type=require("../type"),_toString=Object.prototype.toString;module.exports=new Type("tag:yaml.org,2002:pairs",{kind:"sequence",resolve:resolveYamlPairs,construct:constructYamlPairs});

},{"../type":25}],38:[function(require,module,exports){
"use strict";var Type=require("../type");module.exports=new Type("tag:yaml.org,2002:seq",{kind:"sequence",construct:function(e){return null!==e?e:[]}});

},{"../type":25}],39:[function(require,module,exports){
"use strict";function resolveYamlSet(e){if(null===e)return!0;var r,t=e;for(r in t)if(_hasOwnProperty.call(t,r)&&null!==t[r])return!1;return!0}function constructYamlSet(e){return null!==e?e:{}}var Type=require("../type"),_hasOwnProperty=Object.prototype.hasOwnProperty;module.exports=new Type("tag:yaml.org,2002:set",{kind:"mapping",resolve:resolveYamlSet,construct:constructYamlSet});

},{"../type":25}],40:[function(require,module,exports){
"use strict";var Type=require("../type");module.exports=new Type("tag:yaml.org,2002:str",{kind:"scalar",construct:function(r){return null!==r?r:""}});

},{"../type":25}],41:[function(require,module,exports){
"use strict";function resolveYamlTimestamp(e){if(null===e)return!1;var t;return t=YAML_TIMESTAMP_REGEXP.exec(e),null===t?!1:!0}function constructYamlTimestamp(e){var t,r,n,a,m,s,l,i,T,o,u=0,c=null;if(t=YAML_TIMESTAMP_REGEXP.exec(e),null===t)throw new Error("Date resolve error");if(r=+t[1],n=+t[2]-1,a=+t[3],!t[4])return new Date(Date.UTC(r,n,a));if(m=+t[4],s=+t[5],l=+t[6],t[7]){for(u=t[7].slice(0,3);u.length<3;)u+="0";u=+u}return t[9]&&(i=+t[10],T=+(t[11]||0),c=6e4*(60*i+T),"-"===t[9]&&(c=-c)),o=new Date(Date.UTC(r,n,a,m,s,l,u)),c&&o.setTime(o.getTime()-c),o}function representYamlTimestamp(e){return e.toISOString()}var Type=require("../type"),YAML_TIMESTAMP_REGEXP=new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?)?$");module.exports=new Type("tag:yaml.org,2002:timestamp",{kind:"scalar",resolve:resolveYamlTimestamp,construct:constructYamlTimestamp,instanceOf:Date,represent:representYamlTimestamp});

},{"../type":25}],42:[function(require,module,exports){
!function(e,t){"use strict";"function"==typeof define&&define.amd?define(["exports"],t):t("undefined"!=typeof exports?exports:e.esprima={})}(this,function(e){"use strict";function t(e,t){if(!e)throw new Error("ASSERT: "+t)}function n(e){return e>=48&&57>=e}function i(e){return"0123456789abcdefABCDEF".indexOf(e)>=0}function r(e){return"01234567".indexOf(e)>=0}function a(e){var t="0"!==e,n="01234567".indexOf(e);return mn>nn&&r(Zt[nn])&&(t=!0,n=8*n+"01234567".indexOf(Zt[nn++]),"0123".indexOf(e)>=0&&mn>nn&&r(Zt[nn])&&(n=8*n+"01234567".indexOf(Zt[nn++]))),{code:n,octal:t}}function s(e){return 32===e||9===e||11===e||12===e||160===e||e>=5760&&[5760,6158,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8239,8287,12288,65279].indexOf(e)>=0}function o(e){return 10===e||13===e||8232===e||8233===e}function l(e){return 36===e||95===e||e>=65&&90>=e||e>=97&&122>=e||92===e||e>=128&&Yt.NonAsciiIdentifierStart.test(String.fromCharCode(e))}function u(e){return 36===e||95===e||e>=65&&90>=e||e>=97&&122>=e||e>=48&&57>=e||92===e||e>=128&&Yt.NonAsciiIdentifierPart.test(String.fromCharCode(e))}function c(e){switch(e){case"enum":case"export":case"import":case"super":return!0;default:return!1}}function f(e){switch(e){case"implements":case"interface":case"package":case"private":case"protected":case"public":case"static":case"yield":case"let":return!0;default:return!1}}function h(e){return"eval"===e||"arguments"===e}function p(e){switch(e.length){case 2:return"if"===e||"in"===e||"do"===e;case 3:return"var"===e||"for"===e||"new"===e||"try"===e||"let"===e;case 4:return"this"===e||"else"===e||"case"===e||"void"===e||"with"===e||"enum"===e;case 5:return"while"===e||"break"===e||"catch"===e||"throw"===e||"const"===e||"yield"===e||"class"===e||"super"===e;case 6:return"return"===e||"typeof"===e||"delete"===e||"switch"===e||"export"===e||"import"===e;case 7:return"default"===e||"finally"===e||"extends"===e;case 8:return"function"===e||"continue"===e||"debugger"===e;case 10:return"instanceof"===e;default:return!1}}function m(e,n,i,r,a){var s;t("number"==typeof i,"Comment must have valid position"),yn.lastCommentStart=i,s={type:e,value:n},gn.range&&(s.range=[i,r]),gn.loc&&(s.loc=a),gn.comments.push(s),gn.attachComment&&(gn.leadingComments.push(s),gn.trailingComments.push(s))}function d(e){var t,n,i,r;for(t=nn-e,n={start:{line:rn,column:nn-an-e}};mn>nn;)if(i=Zt.charCodeAt(nn),++nn,o(i))return sn=!0,gn.comments&&(r=Zt.slice(t+e,nn-1),n.end={line:rn,column:nn-an-1},m("Line",r,t,nn-1,n)),13===i&&10===Zt.charCodeAt(nn)&&++nn,++rn,void(an=nn);gn.comments&&(r=Zt.slice(t+e,nn),n.end={line:rn,column:nn-an},m("Line",r,t,nn,n))}function y(){var e,t,n,i;for(gn.comments&&(e=nn-2,t={start:{line:rn,column:nn-an-2}});mn>nn;)if(n=Zt.charCodeAt(nn),o(n))13===n&&10===Zt.charCodeAt(nn+1)&&++nn,sn=!0,++rn,++nn,an=nn;else if(42===n){if(47===Zt.charCodeAt(nn+1))return++nn,++nn,void(gn.comments&&(i=Zt.slice(e+2,nn-2),t.end={line:rn,column:nn-an},m("Block",i,e,nn,t)));++nn}else++nn;gn.comments&&(t.end={line:rn,column:nn-an},i=Zt.slice(e+2,nn),m("Block",i,e,nn,t)),Z()}function g(){var e,t;for(sn=!1,t=0===nn;mn>nn;)if(e=Zt.charCodeAt(nn),s(e))++nn;else if(o(e))sn=!0,++nn,13===e&&10===Zt.charCodeAt(nn)&&++nn,++rn,an=nn,t=!0;else if(47===e)if(e=Zt.charCodeAt(nn+1),47===e)++nn,++nn,d(2),t=!0;else{if(42!==e)break;++nn,++nn,y()}else if(t&&45===e){if(45!==Zt.charCodeAt(nn+1)||62!==Zt.charCodeAt(nn+2))break;nn+=3,d(3)}else{if(60!==e)break;if("!--"!==Zt.slice(nn+1,nn+4))break;++nn,++nn,++nn,++nn,d(4)}}function S(e){var t,n,r,a=0;for(n="u"===e?4:2,t=0;n>t;++t){if(!(mn>nn&&i(Zt[nn])))return"";r=Zt[nn++],a=16*a+"0123456789abcdef".indexOf(r.toLowerCase())}return String.fromCharCode(a)}function v(){var e,t,n,r;for(e=Zt[nn],t=0,"}"===e&&Y();mn>nn&&(e=Zt[nn++],i(e));)t=16*t+"0123456789abcdef".indexOf(e.toLowerCase());return(t>1114111||"}"!==e)&&Y(),65535>=t?String.fromCharCode(t):(n=(t-65536>>10)+55296,r=(t-65536&1023)+56320,String.fromCharCode(n,r))}function x(){var e,t;for(e=Zt.charCodeAt(nn++),t=String.fromCharCode(e),92===e&&(117!==Zt.charCodeAt(nn)&&Y(),++nn,e=S("u"),e&&"\\"!==e&&l(e.charCodeAt(0))||Y(),t=e);mn>nn&&(e=Zt.charCodeAt(nn),u(e));)++nn,t+=String.fromCharCode(e),92===e&&(t=t.substr(0,t.length-1),117!==Zt.charCodeAt(nn)&&Y(),++nn,e=S("u"),e&&"\\"!==e&&u(e.charCodeAt(0))||Y(),t+=e);return t}function w(){var e,t;for(e=nn++;mn>nn;){if(t=Zt.charCodeAt(nn),92===t)return nn=e,x();if(!u(t))break;++nn}return Zt.slice(e,nn)}function b(){var e,t,n;return e=nn,t=92===Zt.charCodeAt(nn)?x():w(),n=1===t.length?_t.Identifier:p(t)?_t.Keyword:"null"===t?_t.NullLiteral:"true"===t||"false"===t?_t.BooleanLiteral:_t.Identifier,{type:n,value:t,lineNumber:rn,lineStart:an,start:e,end:nn}}function E(){var e,t;switch(e={type:_t.Punctuator,value:"",lineNumber:rn,lineStart:an,start:nn,end:nn},t=Zt[nn]){case"(":gn.tokenize&&(gn.openParenToken=gn.tokens.length),++nn;break;case"{":gn.tokenize&&(gn.openCurlyToken=gn.tokens.length),yn.curlyStack.push("{"),++nn;break;case".":++nn,"."===Zt[nn]&&"."===Zt[nn+1]&&(nn+=2,t="...");break;case"}":++nn,yn.curlyStack.pop();break;case")":case";":case",":case"[":case"]":case":":case"?":case"~":++nn;break;default:t=Zt.substr(nn,4),">>>="===t?nn+=4:(t=t.substr(0,3),"==="===t||"!=="===t||">>>"===t||"<<="===t||">>="===t?nn+=3:(t=t.substr(0,2),"&&"===t||"||"===t||"=="===t||"!="===t||"+="===t||"-="===t||"*="===t||"/="===t||"++"===t||"--"===t||"<<"===t||">>"===t||"&="===t||"|="===t||"^="===t||"%="===t||"<="===t||">="===t||"=>"===t?nn+=2:(t=Zt[nn],"<>=!+-*%&|^/".indexOf(t)>=0&&++nn)))}return nn===e.start&&Y(),e.end=nn,e.value=t,e}function C(e){for(var t="";mn>nn&&i(Zt[nn]);)t+=Zt[nn++];return 0===t.length&&Y(),l(Zt.charCodeAt(nn))&&Y(),{type:_t.NumericLiteral,value:parseInt("0x"+t,16),lineNumber:rn,lineStart:an,start:e,end:nn}}function k(e){var t,i;for(i="";mn>nn&&(t=Zt[nn],"0"===t||"1"===t);)i+=Zt[nn++];return 0===i.length&&Y(),mn>nn&&(t=Zt.charCodeAt(nn),(l(t)||n(t))&&Y()),{type:_t.NumericLiteral,value:parseInt(i,2),lineNumber:rn,lineStart:an,start:e,end:nn}}function I(e,t){var i,a;for(r(e)?(a=!0,i="0"+Zt[nn++]):(a=!1,++nn,i="");mn>nn&&r(Zt[nn]);)i+=Zt[nn++];return a||0!==i.length||Y(),(l(Zt.charCodeAt(nn))||n(Zt.charCodeAt(nn)))&&Y(),{type:_t.NumericLiteral,value:parseInt(i,8),octal:a,lineNumber:rn,lineStart:an,start:t,end:nn}}function P(){var e,t;for(e=nn+1;mn>e;++e){if(t=Zt[e],"8"===t||"9"===t)return!1;if(!r(t))return!0}return!0}function A(){var e,i,a;if(a=Zt[nn],t(n(a.charCodeAt(0))||"."===a,"Numeric literal must start with a decimal digit or a decimal point"),i=nn,e="","."!==a){if(e=Zt[nn++],a=Zt[nn],"0"===e){if("x"===a||"X"===a)return++nn,C(i);if("b"===a||"B"===a)return++nn,k(i);if("o"===a||"O"===a)return I(a,i);if(r(a)&&P())return I(a,i)}for(;n(Zt.charCodeAt(nn));)e+=Zt[nn++];a=Zt[nn]}if("."===a){for(e+=Zt[nn++];n(Zt.charCodeAt(nn));)e+=Zt[nn++];a=Zt[nn]}if("e"===a||"E"===a)if(e+=Zt[nn++],a=Zt[nn],("+"===a||"-"===a)&&(e+=Zt[nn++]),n(Zt.charCodeAt(nn)))for(;n(Zt.charCodeAt(nn));)e+=Zt[nn++];else Y();return l(Zt.charCodeAt(nn))&&Y(),{type:_t.NumericLiteral,value:parseFloat(e),lineNumber:rn,lineStart:an,start:i,end:nn}}function D(){var e,n,i,s,l,u="",c=!1;for(e=Zt[nn],t("'"===e||'"'===e,"String literal must starts with a quote"),n=nn,++nn;mn>nn;){if(i=Zt[nn++],i===e){e="";break}if("\\"===i)if(i=Zt[nn++],i&&o(i.charCodeAt(0)))++rn,"\r"===i&&"\n"===Zt[nn]&&++nn,an=nn;else switch(i){case"u":case"x":if("{"===Zt[nn])++nn,u+=v();else{if(s=S(i),!s)throw Y();u+=s}break;case"n":u+="\n";break;case"r":u+="\r";break;case"t":u+="	";break;case"b":u+="\b";break;case"f":u+="\f";break;case"v":u+="";break;case"8":case"9":throw Y();default:r(i)?(l=a(i),c=l.octal||c,u+=String.fromCharCode(l.code)):u+=i}else{if(o(i.charCodeAt(0)))break;u+=i}}return""!==e&&Y(),{type:_t.StringLiteral,value:u,octal:c,lineNumber:fn,lineStart:hn,start:n,end:nn}}function L(){var e,t,i,a,s,l,u,c,f="";for(a=!1,l=!1,t=nn,s="`"===Zt[nn],i=2,++nn;mn>nn;){if(e=Zt[nn++],"`"===e){i=1,l=!0,a=!0;break}if("$"===e){if("{"===Zt[nn]){yn.curlyStack.push("${"),++nn,a=!0;break}f+=e}else if("\\"===e)if(e=Zt[nn++],o(e.charCodeAt(0)))++rn,"\r"===e&&"\n"===Zt[nn]&&++nn,an=nn;else switch(e){case"n":f+="\n";break;case"r":f+="\r";break;case"t":f+="	";break;case"u":case"x":"{"===Zt[nn]?(++nn,f+=v()):(u=nn,c=S(e),c?f+=c:(nn=u,f+=e));break;case"b":f+="\b";break;case"f":f+="\f";break;case"v":f+="";break;default:"0"===e?(n(Zt.charCodeAt(nn))&&X(Qt.TemplateOctalLiteral),f+="\x00"):r(e)?X(Qt.TemplateOctalLiteral):f+=e}else o(e.charCodeAt(0))?(++rn,"\r"===e&&"\n"===Zt[nn]&&++nn,an=nn,f+="\n"):f+=e}return a||Y(),s||yn.curlyStack.pop(),{type:_t.Template,value:{cooked:f,raw:Zt.slice(t+1,nn-i)},head:s,tail:l,lineNumber:rn,lineStart:an,start:t,end:nn}}function T(e,t){var n=e;t.indexOf("u")>=0&&(n=n.replace(/\\u\{([0-9a-fA-F]+)\}/g,function(e,t){return parseInt(t,16)<=1114111?"x":void Y(null,Qt.InvalidRegExp)}).replace(/\\u([a-fA-F0-9]{4})|[\uD800-\uDBFF][\uDC00-\uDFFF]/g,"x"));try{RegExp(n)}catch(i){Y(null,Qt.InvalidRegExp)}try{return new RegExp(e,t)}catch(r){return null}}function N(){var e,n,i,r,a;for(e=Zt[nn],t("/"===e,"Regular expression literal must start with a slash"),n=Zt[nn++],i=!1,r=!1;mn>nn;)if(e=Zt[nn++],n+=e,"\\"===e)e=Zt[nn++],o(e.charCodeAt(0))&&Y(null,Qt.UnterminatedRegExp),n+=e;else if(o(e.charCodeAt(0)))Y(null,Qt.UnterminatedRegExp);else if(i)"]"===e&&(i=!1);else{if("/"===e){r=!0;break}"["===e&&(i=!0)}return r||Y(null,Qt.UnterminatedRegExp),a=n.substr(1,n.length-2),{value:a,literal:n}}function R(){var e,t,n,i;for(t="",n="";mn>nn&&(e=Zt[nn],u(e.charCodeAt(0)));)if(++nn,"\\"===e&&mn>nn)if(e=Zt[nn],"u"===e){if(++nn,i=nn,e=S("u"))for(n+=e,t+="\\u";nn>i;++i)t+=Zt[i];else nn=i,n+="u",t+="\\u";Z()}else t+="\\",Z();else n+=e,t+=e;return{value:n,literal:t}}function F(){pn=!0;var e,t,n,i;return dn=null,g(),e=nn,t=N(),n=R(),i=T(t.value,n.value),pn=!1,gn.tokenize?{type:_t.RegularExpression,value:i,regex:{pattern:t.value,flags:n.value},lineNumber:rn,lineStart:an,start:e,end:nn}:{literal:t.literal+n.literal,value:i,regex:{pattern:t.value,flags:n.value},start:e,end:nn}}function O(){var e,t,n,i;return g(),e=nn,t={start:{line:rn,column:nn-an}},n=F(),t.end={line:rn,column:nn-an},gn.tokenize||(gn.tokens.length>0&&(i=gn.tokens[gn.tokens.length-1],i.range[0]===e&&"Punctuator"===i.type&&("/"===i.value||"/="===i.value)&&gn.tokens.pop()),gn.tokens.push({type:"RegularExpression",value:n.literal,regex:n.regex,range:[e,nn],loc:t})),n}function U(e){return e.type===_t.Identifier||e.type===_t.Keyword||e.type===_t.BooleanLiteral||e.type===_t.NullLiteral}function B(){var e,t;if(e=gn.tokens[gn.tokens.length-1],!e)return O();if("Punctuator"===e.type){if("]"===e.value)return E();if(")"===e.value)return t=gn.tokens[gn.openParenToken-1],!t||"Keyword"!==t.type||"if"!==t.value&&"while"!==t.value&&"for"!==t.value&&"with"!==t.value?E():O();if("}"===e.value){if(gn.tokens[gn.openCurlyToken-3]&&"Keyword"===gn.tokens[gn.openCurlyToken-3].type){if(t=gn.tokens[gn.openCurlyToken-4],!t)return E()}else{if(!gn.tokens[gn.openCurlyToken-4]||"Keyword"!==gn.tokens[gn.openCurlyToken-4].type)return E();if(t=gn.tokens[gn.openCurlyToken-5],!t)return O()}return Gt.indexOf(t.value)>=0?E():O()}return O()}return"Keyword"===e.type&&"this"!==e.value?O():E()}function M(){var e,t;return nn>=mn?{type:_t.EOF,lineNumber:rn,lineStart:an,start:nn,end:nn}:(e=Zt.charCodeAt(nn),l(e)?(t=b(),en&&f(t.value)&&(t.type=_t.Keyword),t):40===e||41===e||59===e?E():39===e||34===e?D():46===e?n(Zt.charCodeAt(nn+1))?A():E():n(e)?A():gn.tokenize&&47===e?B():96===e||125===e&&"${"===yn.curlyStack[yn.curlyStack.length-1]?L():E())}function j(){var e,t,n,i;return e={start:{line:rn,column:nn-an}},t=M(),e.end={line:rn,column:nn-an},t.type!==_t.EOF&&(n=Zt.slice(t.start,t.end),i={type:$t[t.type],value:n,range:[t.start,t.end],loc:e},t.regex&&(i.regex={pattern:t.regex.pattern,flags:t.regex.flags}),gn.tokens.push(i)),t}function W(){var e;return pn=!0,on=nn,ln=rn,un=an,g(),e=dn,cn=nn,fn=rn,hn=an,dn="undefined"!=typeof gn.tokens?j():M(),pn=!1,e}function K(){pn=!0,g(),on=nn,ln=rn,un=an,cn=nn,fn=rn,hn=an,dn="undefined"!=typeof gn.tokens?j():M(),pn=!1}function H(){this.line=fn,this.column=cn-hn}function V(){this.start=new H,this.end=null}function q(e){this.start={line:e.lineNumber,column:e.start-e.lineStart},this.end=null}function z(){gn.range&&(this.range=[cn,0]),gn.loc&&(this.loc=new V)}function _(e){gn.range&&(this.range=[e.start,0]),gn.loc&&(this.loc=new q(e))}function $(e){var t,n;for(t=0;t<gn.errors.length;t++)if(n=gn.errors[t],n.index===e.index&&n.message===e.message)return;gn.errors.push(e)}function G(e,t,n){var i=new Error("Line "+e+": "+n);return i.index=t,i.lineNumber=e,i.column=t-(pn?an:un)+1,i.description=n,i}function X(e){var n,i;throw n=Array.prototype.slice.call(arguments,1),i=e.replace(/%(\d)/g,function(e,i){return t(i<n.length,"Message reference must be in range"),n[i]}),G(ln,on,i)}function J(e){var n,i,r;if(n=Array.prototype.slice.call(arguments,1),i=e.replace(/%(\d)/g,function(e,i){return t(i<n.length,"Message reference must be in range"),n[i]}),r=G(rn,on,i),!gn.errors)throw r;$(r)}function Q(e,t){var n,i=t||Qt.UnexpectedToken;return e?(t||(i=e.type===_t.EOF?Qt.UnexpectedEOS:e.type===_t.Identifier?Qt.UnexpectedIdentifier:e.type===_t.NumericLiteral?Qt.UnexpectedNumber:e.type===_t.StringLiteral?Qt.UnexpectedString:e.type===_t.Template?Qt.UnexpectedTemplate:Qt.UnexpectedToken,e.type===_t.Keyword&&(c(e.value)?i=Qt.UnexpectedReserved:en&&f(e.value)&&(i=Qt.StrictReservedWord))),n=e.type===_t.Template?e.value.raw:e.value):n="ILLEGAL",i=i.replace("%0",n),e&&"number"==typeof e.lineNumber?G(e.lineNumber,e.start,i):G(pn?rn:ln,pn?nn:on,i)}function Y(e,t){throw Q(e,t)}function Z(e,t){var n=Q(e,t);if(!gn.errors)throw n;$(n)}function ee(e){var t=W();(t.type!==_t.Punctuator||t.value!==e)&&Y(t)}function te(){var e;gn.errors?(e=dn,e.type===_t.Punctuator&&","===e.value?W():e.type===_t.Punctuator&&";"===e.value?(W(),Z(e)):Z(e,Qt.UnexpectedToken)):ee(",")}function ne(e){var t=W();(t.type!==_t.Keyword||t.value!==e)&&Y(t)}function ie(e){return dn.type===_t.Punctuator&&dn.value===e}function re(e){return dn.type===_t.Keyword&&dn.value===e}function ae(e){return dn.type===_t.Identifier&&dn.value===e}function se(){var e;return dn.type!==_t.Punctuator?!1:(e=dn.value,"="===e||"*="===e||"/="===e||"%="===e||"+="===e||"-="===e||"<<="===e||">>="===e||">>>="===e||"&="===e||"^="===e||"|="===e)}function oe(){return 59===Zt.charCodeAt(cn)||ie(";")?void W():void(sn||(on=cn,ln=fn,un=hn,dn.type===_t.EOF||ie("}")||Y(dn)))}function le(e){var t,n=Sn,i=vn,r=xn;return Sn=!0,vn=!0,xn=null,t=e(),null!==xn&&Y(xn),Sn=n,vn=i,xn=r,t}function ue(e){var t,n=Sn,i=vn,r=xn;return Sn=!0,vn=!0,xn=null,t=e(),Sn=Sn&&n,vn=vn&&i,xn=r||xn,t}function ce(){var e,t,n=new z,i=[];for(ee("[");!ie("]");)if(ie(","))W(),i.push(null);else{if(ie("...")){t=new z,W(),e=Je(),i.push(t.finishRestElement(e));break}i.push(me()),ie("]")||ee(",")}return ee("]"),n.finishArrayPattern(i)}function fe(){var e,t,n=new z,i=ie("[");if(dn.type===_t.Identifier){if(e=Je(),ie("="))return W(),t=ze(),n.finishProperty("init",e,!1,new _(e).finishAssignmentPattern(e,t),!1,!1);if(!ie(":"))return n.finishProperty("init",e,!1,e,!1,!0)}else e=Se();return ee(":"),t=me(),n.finishProperty("init",e,i,t,!1,!1)}function he(){var e=new z,t=[];for(ee("{");!ie("}");)t.push(fe()),ie("}")||ee(",");return W(),e.finishObjectPattern(t)}function pe(){return dn.type===_t.Identifier?Je():ie("[")?ce():ie("{")?he():void Y(dn)}function me(){var e,t,n=dn;return e=pe(),ie("=")&&(W(),t=le(ze),e=new _(n).finishAssignmentPattern(e,t)),e}function de(){var e,t=[],n=new z;for(ee("[");!ie("]");)ie(",")?(W(),t.push(null)):ie("...")?(e=new z,W(),e.finishSpreadElement(ue(ze)),ie("]")||(vn=Sn=!1,ee(",")),t.push(e)):(t.push(ue(ze)),ie("]")||ee(","));return W(),n.finishArrayExpression(t)}function ye(e,t){var n,i;return vn=Sn=!1,n=en,i=le(wt),en&&t.firstRestricted&&Z(t.firstRestricted,t.message),en&&t.stricted&&Z(t.stricted,t.message),en=n,e.finishFunctionExpression(null,t.params,t.defaults,i)}function ge(){var e,t,n=new z;return e=Ct(),t=ye(n,e)}function Se(){var e,t,n=new z;switch(e=W(),e.type){case _t.StringLiteral:case _t.NumericLiteral:return en&&e.octal&&Z(e,Qt.StrictOctalLiteral),n.finishLiteral(e);case _t.Identifier:case _t.BooleanLiteral:case _t.NullLiteral:case _t.Keyword:return n.finishIdentifier(e.value);case _t.Punctuator:if("["===e.value)return t=le(ze),ee("]"),t}Y(e)}function ve(){switch(dn.type){case _t.Identifier:case _t.StringLiteral:case _t.BooleanLiteral:case _t.NullLiteral:case _t.NumericLiteral:case _t.Keyword:return!0;case _t.Punctuator:return"["===dn.value}return!1}function xe(e,t,n,i){var r,a,s;if(e.type===_t.Identifier){if("get"===e.value&&ve())return n=ie("["),t=Se(),s=new z,ee("("),ee(")"),r=ye(s,{params:[],defaults:[],stricted:null,firstRestricted:null,message:null}),i.finishProperty("get",t,n,r,!1,!1);if("set"===e.value&&ve())return n=ie("["),t=Se(),s=new z,ee("("),a={params:[],defaultCount:0,defaults:[],firstRestricted:null,paramSet:{}},ie(")")?Z(dn):(Et(a),0===a.defaultCount&&(a.defaults=[])),ee(")"),r=ye(s,a),i.finishProperty("set",t,n,r,!1,!1)}return ie("(")?(r=ge(),i.finishProperty("init",t,n,r,!0,!1)):null}function we(e,t,n){t===!1&&(e.type===Xt.Identifier&&"__proto__"===e.name||e.type===Xt.Literal&&"__proto__"===e.value)&&(n.value?J(Qt.DuplicateProtoProperty):n.value=!0)}function be(e){var t,n,i,r,a=dn,s=new z;return t=ie("["),n=Se(),(i=xe(a,n,t,s))?(we(i.key,i.computed,e),i):(we(n,t,e),ie(":")?(W(),r=ue(ze),s.finishProperty("init",n,t,r,!1,!1)):a.type===_t.Identifier?ie("=")?(xn=dn,W(),r=le(ze),s.finishProperty("init",n,t,new _(a).finishAssignmentPattern(n,r),!1,!0)):s.finishProperty("init",n,t,n,!1,!0):void Y(dn))}function Ee(){var e=[],t={value:!1},n=new z;for(ee("{");!ie("}");)e.push(be(t)),ie("}")||te();return ee("}"),n.finishObjectExpression(e)}function Ce(e){var t;switch(e.type){case Xt.Identifier:case Xt.MemberExpression:case Xt.RestElement:case Xt.AssignmentPattern:break;case Xt.SpreadElement:e.type=Xt.RestElement,Ce(e.argument);break;case Xt.ArrayExpression:for(e.type=Xt.ArrayPattern,t=0;t<e.elements.length;t++)null!==e.elements[t]&&Ce(e.elements[t]);break;case Xt.ObjectExpression:for(e.type=Xt.ObjectPattern,t=0;t<e.properties.length;t++)Ce(e.properties[t].value);break;case Xt.AssignmentExpression:e.type=Xt.AssignmentPattern,Ce(e.left)}}function ke(e){var t,n;return(dn.type!==_t.Template||e.head&&!dn.head)&&Y(),t=new z,n=W(),t.finishTemplateElement({raw:n.value.raw,cooked:n.value.cooked},n.tail)}function Ie(){var e,t,n,i=new z;for(e=ke({head:!0}),t=[e],n=[];!e.tail;)n.push(_e()),e=ke({head:!1}),t.push(e);return i.finishTemplateLiteral(t,n)}function Pe(){var e,t,n,i;if(ee("("),ie(")"))return W(),ie("=>")||ee("=>"),{type:Jt.ArrowParameterPlaceHolder,params:[]};if(n=dn,ie("..."))return e=it(),ee(")"),ie("=>")||ee("=>"),{type:Jt.ArrowParameterPlaceHolder,params:[e]};if(Sn=!0,e=ue(ze),ie(",")){for(vn=!1,t=[e];mn>cn&&ie(",");){if(W(),ie("...")){for(Sn||Y(dn),t.push(it()),ee(")"),ie("=>")||ee("=>"),Sn=!1,i=0;i<t.length;i++)Ce(t[i]);return{type:Jt.ArrowParameterPlaceHolder,params:t}}t.push(ue(ze))}e=new _(n).finishSequenceExpression(t)}if(ee(")"),ie("=>")){if(Sn||Y(dn),e.type===Xt.SequenceExpression)for(i=0;i<e.expressions.length;i++)Ce(e.expressions[i]);else Ce(e);e={type:Jt.ArrowParameterPlaceHolder,params:e.type===Xt.SequenceExpression?e.expressions:[e]}}return Sn=!1,e}function Ae(){var e,t,n,i;if(ie("("))return Sn=!1,ue(Pe);if(ie("["))return ue(de);if(ie("{"))return ue(Ee);if(e=dn.type,i=new z,e===_t.Identifier)n=i.finishIdentifier(W().value);else if(e===_t.StringLiteral||e===_t.NumericLiteral)vn=Sn=!1,en&&dn.octal&&Z(dn,Qt.StrictOctalLiteral),n=i.finishLiteral(W());else if(e===_t.Keyword){if(vn=Sn=!1,re("function"))return It();if(re("this"))return W(),i.finishThisExpression();if(re("class"))return Dt();Y(W())}else e===_t.BooleanLiteral?(vn=Sn=!1,t=W(),t.value="true"===t.value,n=i.finishLiteral(t)):e===_t.NullLiteral?(vn=Sn=!1,t=W(),t.value=null,n=i.finishLiteral(t)):ie("/")||ie("/=")?(vn=Sn=!1,nn=cn,t="undefined"!=typeof gn.tokens?O():F(),W(),n=i.finishLiteral(t)):e===_t.Template?n=Ie():Y(W());return n}function De(){var e=[];if(ee("("),!ie(")"))for(;mn>cn&&(e.push(le(ze)),!ie(")"));)te();return ee(")"),e}function Le(){var e,t=new z;return e=W(),U(e)||Y(e),t.finishIdentifier(e.value)}function Te(){return ee("."),Le()}function Ne(){var e;return ee("["),e=le(_e),ee("]"),e}function Re(){var e,t,n=new z;return ne("new"),e=le(Oe),t=ie("(")?De():[],vn=Sn=!1,n.finishNewExpression(e,t)}function Fe(){var e,t,n,i,r,a=yn.allowIn;for(r=dn,yn.allowIn=!0,re("super")&&yn.inFunctionBody?(t=new z,W(),t=t.finishSuper(),ie("(")||ie(".")||ie("[")||Y(dn)):t=ue(re("new")?Re:Ae);;)if(ie("."))Sn=!1,vn=!0,i=Te(),t=new _(r).finishMemberExpression(".",t,i);else if(ie("("))Sn=!1,vn=!1,n=De(),t=new _(r).finishCallExpression(t,n);else if(ie("["))Sn=!1,vn=!0,i=Ne(),t=new _(r).finishMemberExpression("[",t,i);else{if(dn.type!==_t.Template||!dn.head)break;e=Ie(),t=new _(r).finishTaggedTemplateExpression(t,e)}return yn.allowIn=a,t}function Oe(){var e,n,i,r;for(t(yn.allowIn,"callee of new expression always allow in keyword."),r=dn,re("super")&&yn.inFunctionBody?(n=new z,W(),n=n.finishSuper(),ie("[")||ie(".")||Y(dn)):n=ue(re("new")?Re:Ae);;)if(ie("["))Sn=!1,vn=!0,i=Ne(),n=new _(r).finishMemberExpression("[",n,i);else if(ie("."))Sn=!1,vn=!0,i=Te(),n=new _(r).finishMemberExpression(".",n,i);else{if(dn.type!==_t.Template||!dn.head)break;e=Ie(),n=new _(r).finishTaggedTemplateExpression(n,e)}return n}function Ue(){var e,t,n=dn;return e=ue(Fe),sn||dn.type!==_t.Punctuator||(ie("++")||ie("--"))&&(en&&e.type===Xt.Identifier&&h(e.name)&&J(Qt.StrictLHSPostfix),vn||J(Qt.InvalidLHSInAssignment),vn=Sn=!1,t=W(),e=new _(n).finishPostfixExpression(t.value,e)),e}function Be(){var e,t,n;return dn.type!==_t.Punctuator&&dn.type!==_t.Keyword?t=Ue():ie("++")||ie("--")?(n=dn,e=W(),t=ue(Be),en&&t.type===Xt.Identifier&&h(t.name)&&J(Qt.StrictLHSPrefix),vn||J(Qt.InvalidLHSInAssignment),t=new _(n).finishUnaryExpression(e.value,t),vn=Sn=!1):ie("+")||ie("-")||ie("~")||ie("!")?(n=dn,e=W(),t=ue(Be),t=new _(n).finishUnaryExpression(e.value,t),vn=Sn=!1):re("delete")||re("void")||re("typeof")?(n=dn,e=W(),t=ue(Be),t=new _(n).finishUnaryExpression(e.value,t),en&&"delete"===t.operator&&t.argument.type===Xt.Identifier&&J(Qt.StrictDelete),vn=Sn=!1):t=Ue(),t}function Me(e,t){var n=0;if(e.type!==_t.Punctuator&&e.type!==_t.Keyword)return 0;switch(e.value){case"||":n=1;break;case"&&":n=2;break;case"|":n=3;break;case"^":n=4;break;case"&":n=5;break;case"==":case"!=":case"===":case"!==":n=6;break;case"<":case">":case"<=":case">=":case"instanceof":n=7;break;case"in":n=t?7:0;break;case"<<":case">>":case">>>":n=8;break;case"+":case"-":n=9;break;case"*":case"/":case"%":n=11}return n}function je(){var e,t,n,i,r,a,s,o,l,u;if(e=dn,l=ue(Be),i=dn,r=Me(i,yn.allowIn),0===r)return l;for(vn=Sn=!1,i.prec=r,W(),t=[e,dn],s=le(Be),a=[l,i,s];(r=Me(dn,yn.allowIn))>0;){for(;a.length>2&&r<=a[a.length-2].prec;)s=a.pop(),o=a.pop().value,l=a.pop(),t.pop(),n=new _(t[t.length-1]).finishBinaryExpression(o,l,s),a.push(n);i=W(),i.prec=r,a.push(i),t.push(dn),n=le(Be),a.push(n)}for(u=a.length-1,n=a[u],t.pop();u>1;)n=new _(t.pop()).finishBinaryExpression(a[u-1].value,a[u-2],n),u-=2;return n}function We(){var e,t,n,i,r;return r=dn,e=ue(je),ie("?")&&(W(),t=yn.allowIn,yn.allowIn=!0,n=le(ze),yn.allowIn=t,ee(":"),i=le(ze),e=new _(r).finishConditionalExpression(e,n,i),vn=Sn=!1),e}function Ke(){return ie("{")?wt():le(ze)}function He(e,n){var i;switch(n.type){case Xt.Identifier:bt(e,n,n.name);break;case Xt.RestElement:He(e,n.argument);break;case Xt.AssignmentPattern:He(e,n.left);break;case Xt.ArrayPattern:for(i=0;i<n.elements.length;i++)null!==n.elements[i]&&He(e,n.elements[i]);break;default:for(t(n.type===Xt.ObjectPattern,"Invalid type"),i=0;i<n.properties.length;i++)He(e,n.properties[i].value)}}function Ve(e){var t,n,i,r,a,s,o,l;switch(a=[],s=0,r=[e],e.type){case Xt.Identifier:break;case Jt.ArrowParameterPlaceHolder:r=e.params;break;default:return null}for(o={paramSet:{}},t=0,n=r.length;n>t;t+=1)switch(i=r[t],i.type){case Xt.AssignmentPattern:r[t]=i.left,a.push(i.right),++s,He(o,i.left);break;default:He(o,i),r[t]=i,a.push(null)}return o.message===Qt.StrictParamDupe&&(l=en?o.stricted:o.firstRestricted,Y(l,o.message)),0===s&&(a=[]),{params:r,defaults:a,stricted:o.stricted,firstRestricted:o.firstRestricted,message:o.message}}function qe(e,t){var n,i;return sn&&Z(dn),ee("=>"),n=en,i=Ke(),en&&e.firstRestricted&&Y(e.firstRestricted,e.message),en&&e.stricted&&Z(e.stricted,e.message),en=n,t.finishArrowFunctionExpression(e.params,e.defaults,i,i.type!==Xt.BlockStatement)}function ze(){var e,t,n,i,r;return r=dn,e=dn,t=We(),t.type===Jt.ArrowParameterPlaceHolder||ie("=>")?(vn=Sn=!1,i=Ve(t),i?(xn=null,qe(i,new _(r))):t):(se()&&(vn||J(Qt.InvalidLHSInAssignment),en&&t.type===Xt.Identifier&&h(t.name)&&Z(e,Qt.StrictLHSAssignment),ie("=")?Ce(t):vn=Sn=!1,e=W(),n=le(ze),t=new _(r).finishAssignmentExpression(e.value,t,n),xn=null),t)}function _e(){var e,t,n=dn;if(e=le(ze),ie(",")){for(t=[e];mn>cn&&ie(",");)W(),t.push(le(ze));e=new _(n).finishSequenceExpression(t)}return e}function $e(){if(dn.type===_t.Keyword)switch(dn.value){case"export":return"module"!==tn&&Z(dn,Qt.IllegalExportDeclaration),Ot();case"import":return"module"!==tn&&Z(dn,Qt.IllegalImportDeclaration),Wt();case"const":case"let":return nt({inFor:!1});case"function":return kt(new z);case"class":return At()}return xt()}function Ge(){for(var e=[];mn>cn&&!ie("}");)e.push($e());return e}function Xe(){var e,t=new z;return ee("{"),e=Ge(),ee("}"),t.finishBlockStatement(e)}function Je(){var e,t=new z;return e=W(),e.type!==_t.Identifier&&(en&&e.type===_t.Keyword&&f(e.value)?Z(e,Qt.StrictReservedWord):Y(e)),t.finishIdentifier(e.value)}function Qe(){var e,t=null,n=new z;return e=pe(),en&&h(e.name)&&J(Qt.StrictVarName),ie("=")?(W(),t=le(ze)):e.type!==Xt.Identifier&&ee("="),n.finishVariableDeclarator(e,t)}function Ye(){var e=[];do{if(e.push(Qe()),!ie(","))break;W()}while(mn>cn);return e}function Ze(e){var t;return ne("var"),t=Ye(),oe(),e.finishVariableDeclaration(t)}function et(e,t){var n,i=null,r=new z;return n=pe(),en&&n.type===Xt.Identifier&&h(n.name)&&J(Qt.StrictVarName),"const"===e?re("in")||(ee("="),i=le(ze)):(!t.inFor&&n.type!==Xt.Identifier||ie("="))&&(ee("="),i=le(ze)),r.finishVariableDeclarator(n,i)}function tt(e,t){var n=[];do{if(n.push(et(e,t)),!ie(","))break;W()}while(mn>cn);return n}function nt(e){var n,i,r=new z;return n=W().value,t("let"===n||"const"===n,"Lexical declaration must be either let or const"),i=tt(n,e),oe(),r.finishLexicalDeclaration(i,n)}function it(){var e,t=new z;return W(),ie("{")&&X(Qt.ObjectPatternAsRestParameter),e=Je(),ie("=")&&X(Qt.DefaultRestParameter),ie(")")||X(Qt.ParameterAfterRestParameter),t.finishRestElement(e)}function rt(e){return ee(";"),e.finishEmptyStatement()}function at(e){var t=_e();return oe(),e.finishExpressionStatement(t)}function st(e){var t,n,i;return ne("if"),ee("("),t=_e(),ee(")"),n=xt(),re("else")?(W(),i=xt()):i=null,e.finishIfStatement(t,n,i)}function ot(e){var t,n,i;return ne("do"),i=yn.inIteration,yn.inIteration=!0,t=xt(),yn.inIteration=i,ne("while"),ee("("),n=_e(),ee(")"),ie(";")&&W(),e.finishDoWhileStatement(t,n)}function lt(e){var t,n,i;return ne("while"),ee("("),t=_e(),ee(")"),i=yn.inIteration,yn.inIteration=!0,n=xt(),yn.inIteration=i,e.finishWhileStatement(t,n)}function ut(e){var t,n,i,r,a,s,o,l,u,c,f,h=yn.allowIn;if(t=r=a=null,ne("for"),ee("("),ie(";"))W();else if(re("var"))t=new z,W(),yn.allowIn=!1,t=t.finishVariableDeclaration(Ye()),yn.allowIn=h,1===t.declarations.length&&re("in")?(W(),s=t,o=_e(),t=null):ee(";");else if(re("const")||re("let"))t=new z,l=W().value,yn.allowIn=!1,u=tt(l,{inFor:!0}),yn.allowIn=h,1===u.length&&null===u[0].init&&re("in")?(t=t.finishLexicalDeclaration(u,l),W(),s=t,o=_e(),t=null):(oe(),t=t.finishLexicalDeclaration(u,l));else if(i=dn,yn.allowIn=!1,t=ue(ze),yn.allowIn=h,re("in"))vn||J(Qt.InvalidLHSInForIn),W(),Ce(t),s=t,o=_e(),t=null;else{if(ie(",")){for(n=[t];ie(",");)W(),n.push(le(ze));t=new _(i).finishSequenceExpression(n)}ee(";")}return"undefined"==typeof s&&(ie(";")||(r=_e()),ee(";"),ie(")")||(a=_e())),ee(")"),f=yn.inIteration,yn.inIteration=!0,c=le(xt),yn.inIteration=f,"undefined"==typeof s?e.finishForStatement(t,r,a,c):e.finishForInStatement(s,o,c)}function ct(e){var t,n=null;return ne("continue"),59===Zt.charCodeAt(cn)?(W(),yn.inIteration||X(Qt.IllegalContinue),e.finishContinueStatement(null)):sn?(yn.inIteration||X(Qt.IllegalContinue),e.finishContinueStatement(null)):(dn.type===_t.Identifier&&(n=Je(),t="$"+n.name,Object.prototype.hasOwnProperty.call(yn.labelSet,t)||X(Qt.UnknownLabel,n.name)),oe(),null!==n||yn.inIteration||X(Qt.IllegalContinue),e.finishContinueStatement(n))}function ft(e){var t,n=null;return ne("break"),59===Zt.charCodeAt(on)?(W(),yn.inIteration||yn.inSwitch||X(Qt.IllegalBreak),e.finishBreakStatement(null)):sn?(yn.inIteration||yn.inSwitch||X(Qt.IllegalBreak),e.finishBreakStatement(null)):(dn.type===_t.Identifier&&(n=Je(),t="$"+n.name,Object.prototype.hasOwnProperty.call(yn.labelSet,t)||X(Qt.UnknownLabel,n.name)),oe(),null!==n||yn.inIteration||yn.inSwitch||X(Qt.IllegalBreak),e.finishBreakStatement(n))}function ht(e){var t=null;return ne("return"),yn.inFunctionBody||J(Qt.IllegalReturn),32===Zt.charCodeAt(on)&&l(Zt.charCodeAt(on+1))?(t=_e(),oe(),e.finishReturnStatement(t)):sn?e.finishReturnStatement(null):(ie(";")||ie("}")||dn.type===_t.EOF||(t=_e()),oe(),e.finishReturnStatement(t))}function pt(e){var t,n;return en&&J(Qt.StrictModeWith),ne("with"),ee("("),t=_e(),ee(")"),n=xt(),e.finishWithStatement(t,n)}function mt(){var e,t,n=[],i=new z;for(re("default")?(W(),e=null):(ne("case"),e=_e()),ee(":");mn>cn&&!(ie("}")||re("default")||re("case"));)t=$e(),n.push(t);return i.finishSwitchCase(e,n)}function dt(e){var t,n,i,r,a;if(ne("switch"),ee("("),t=_e(),ee(")"),ee("{"),n=[],ie("}"))return W(),e.finishSwitchStatement(t,n);for(r=yn.inSwitch,yn.inSwitch=!0,a=!1;mn>cn&&!ie("}");)i=mt(),null===i.test&&(a&&X(Qt.MultipleDefaultsInSwitch),a=!0),n.push(i);return yn.inSwitch=r,ee("}"),e.finishSwitchStatement(t,n)}function yt(e){var t;return ne("throw"),sn&&X(Qt.NewlineAfterThrow),t=_e(),oe(),e.finishThrowStatement(t)}function gt(){var e,t,n=new z;return ne("catch"),ee("("),ie(")")&&Y(dn),e=pe(),en&&h(e.name)&&J(Qt.StrictCatchVariable),ee(")"),t=Xe(),n.finishCatchClause(e,t)}function St(e){var t,n=null,i=null;return ne("try"),t=Xe(),re("catch")&&(n=gt()),re("finally")&&(W(),i=Xe()),n||i||X(Qt.NoCatchOrFinally),e.finishTryStatement(t,n,i)}function vt(e){return ne("debugger"),oe(),e.finishDebuggerStatement()}function xt(){var e,t,n,i,r=dn.type;if(r===_t.EOF&&Y(dn),r===_t.Punctuator&&"{"===dn.value)return Xe();if(vn=Sn=!0,i=new z,r===_t.Punctuator)switch(dn.value){case";":return rt(i);case"(":return at(i)}else if(r===_t.Keyword)switch(dn.value){case"break":return ft(i);case"continue":return ct(i);case"debugger":return vt(i);case"do":return ot(i);case"for":return ut(i);case"function":return kt(i);case"if":return st(i);case"return":return ht(i);case"switch":return dt(i);case"throw":return yt(i);case"try":return St(i);case"var":return Ze(i);case"while":return lt(i);case"with":return pt(i)}return e=_e(),e.type===Xt.Identifier&&ie(":")?(W(),n="$"+e.name,Object.prototype.hasOwnProperty.call(yn.labelSet,n)&&X(Qt.Redeclaration,"Label",e.name),yn.labelSet[n]=!0,t=xt(),delete yn.labelSet[n],i.finishLabeledStatement(e,t)):(oe(),i.finishExpressionStatement(e))}function wt(){var e,t,n,i,r,a,s,o,l,u=[],c=new z;for(ee("{");mn>cn&&dn.type===_t.StringLiteral&&(t=dn,e=$e(),u.push(e),e.expression.type===Xt.Literal);)n=Zt.slice(t.start+1,t.end-1),"use strict"===n?(en=!0,i&&Z(i,Qt.StrictOctalLiteral)):!i&&t.octal&&(i=t);for(r=yn.labelSet,a=yn.inIteration,s=yn.inSwitch,o=yn.inFunctionBody,l=yn.parenthesizedCount,yn.labelSet={},yn.inIteration=!1,yn.inSwitch=!1,yn.inFunctionBody=!0,yn.parenthesizedCount=0;mn>cn&&!ie("}");)u.push($e());return ee("}"),yn.labelSet=r,yn.inIteration=a,yn.inSwitch=s,yn.inFunctionBody=o,
yn.parenthesizedCount=l,c.finishBlockStatement(u)}function bt(e,t,n){var i="$"+n;en?(h(n)&&(e.stricted=t,e.message=Qt.StrictParamName),Object.prototype.hasOwnProperty.call(e.paramSet,i)&&(e.stricted=t,e.message=Qt.StrictParamDupe)):e.firstRestricted||(h(n)?(e.firstRestricted=t,e.message=Qt.StrictParamName):f(n)?(e.firstRestricted=t,e.message=Qt.StrictReservedWord):Object.prototype.hasOwnProperty.call(e.paramSet,i)&&(e.firstRestricted=t,e.message=Qt.StrictParamDupe)),e.paramSet[i]=!0}function Et(e){var t,n,i;return t=dn,"..."===t.value?(n=it(),bt(e,n.argument,n.argument.name),e.params.push(n),e.defaults.push(null),!1):(n=me(),bt(e,t,t.value),n.type===Xt.AssignmentPattern&&(i=n.right,n=n.left,++e.defaultCount),e.params.push(n),e.defaults.push(i),!ie(")"))}function Ct(e){var t;if(t={params:[],defaultCount:0,defaults:[],firstRestricted:e},ee("("),!ie(")"))for(t.paramSet={};mn>cn&&Et(t);)ee(",");return ee(")"),0===t.defaultCount&&(t.defaults=[]),{params:t.params,defaults:t.defaults,stricted:t.stricted,firstRestricted:t.firstRestricted,message:t.message}}function kt(e,t){var n,i,r,a,s,o,l,u=null,c=[],p=[];return ne("function"),t&&ie("(")||(i=dn,u=Je(),en?h(i.value)&&Z(i,Qt.StrictFunctionName):h(i.value)?(s=i,o=Qt.StrictFunctionName):f(i.value)&&(s=i,o=Qt.StrictReservedWord)),a=Ct(s),c=a.params,p=a.defaults,r=a.stricted,s=a.firstRestricted,a.message&&(o=a.message),l=en,n=wt(),en&&s&&Y(s,o),en&&r&&Z(r,o),en=l,e.finishFunctionDeclaration(u,c,p,n)}function It(){var e,t,n,i,r,a,s,o=null,l=[],u=[],c=new z;return ne("function"),ie("(")||(e=dn,o=Je(),en?h(e.value)&&Z(e,Qt.StrictFunctionName):h(e.value)?(n=e,i=Qt.StrictFunctionName):f(e.value)&&(n=e,i=Qt.StrictReservedWord)),r=Ct(n),l=r.params,u=r.defaults,t=r.stricted,n=r.firstRestricted,r.message&&(i=r.message),s=en,a=wt(),en&&n&&Y(n,i),en&&t&&Z(t,i),en=s,c.finishFunctionExpression(o,l,u,a)}function Pt(){var e,t,n,i,r,a,s,o=!1;for(e=new z,ee("{"),i=[];!ie("}");)ie(";")?W():(r=new z,t=dn,n=!1,a=ie("["),s=Se(),"static"===s.name&&ve()&&(t=dn,n=!0,a=ie("["),s=Se()),r=xe(t,s,a,r),r?(r["static"]=n,"init"===r.kind&&(r.kind="method"),n?r.computed||"prototype"!==(r.key.name||r.key.value.toString())||Y(t,Qt.StaticPrototype):r.computed||"constructor"!==(r.key.name||r.key.value.toString())||(("method"!==r.kind||!r.method||r.value.generator)&&Y(t,Qt.ConstructorSpecialMethod),o?Y(t,Qt.DuplicateConstructor):o=!0,r.kind="constructor"),r.type=Xt.MethodDefinition,delete r.method,delete r.shorthand,i.push(r)):Y(dn));return W(),e.finishClassBody(i)}function At(e){var t,n=null,i=null,r=new z,a=en;return en=!0,ne("class"),e&&dn.type!==_t.Identifier||(n=Je()),re("extends")&&(W(),i=le(Fe)),t=Pt(),en=a,r.finishClassDeclaration(n,i,t)}function Dt(){var e,t=null,n=null,i=new z,r=en;return en=!0,ne("class"),dn.type===_t.Identifier&&(t=Je()),re("extends")&&(W(),n=le(Fe)),e=Pt(),en=r,i.finishClassExpression(t,n,e)}function Lt(){var e=new z;return dn.type!==_t.StringLiteral&&X(Qt.InvalidModuleSpecifier),e.finishLiteral(W())}function Tt(){var e,t,n,i=new z;return re("default")?(n=new z,W(),t=n.finishIdentifier("default")):t=Je(),ae("as")&&(W(),e=Le()),i.finishExportSpecifier(t,e)}function Nt(e){var t,n=null,i=null,r=[];if(dn.type===_t.Keyword)switch(dn.value){case"let":case"const":case"var":case"class":case"function":return n=$e(),e.finishExportNamedDeclaration(n,r,null)}if(ee("{"),!ie("}"))do t=t||re("default"),r.push(Tt());while(ie(",")&&W());return ee("}"),ae("from")?(W(),i=Lt(),oe()):t?X(dn.value?Qt.UnexpectedToken:Qt.MissingFromClause,dn.value):oe(),e.finishExportNamedDeclaration(n,r,i)}function Rt(e){var t=null,n=null;return ne("default"),re("function")?(t=kt(new z,!0),e.finishExportDefaultDeclaration(t)):re("class")?(t=At(!0),e.finishExportDefaultDeclaration(t)):(ae("from")&&X(Qt.UnexpectedToken,dn.value),n=ie("{")?Ee():ie("[")?de():ze(),oe(),e.finishExportDefaultDeclaration(n))}function Ft(e){var t;return ee("*"),ae("from")||X(dn.value?Qt.UnexpectedToken:Qt.MissingFromClause,dn.value),W(),t=Lt(),oe(),e.finishExportAllDeclaration(t)}function Ot(){var e=new z;return yn.inFunctionBody&&X(Qt.IllegalExportDeclaration),ne("export"),re("default")?Rt(e):ie("*")?Ft(e):Nt(e)}function Ut(){var e,t,n=new z;return t=Le(),ae("as")&&(W(),e=Je()),n.finishImportSpecifier(e,t)}function Bt(){var e=[];if(ee("{"),!ie("}"))do e.push(Ut());while(ie(",")&&W());return ee("}"),e}function Mt(){var e,t=new z;return e=Le(),t.finishImportDefaultSpecifier(e)}function jt(){var e,t=new z;return ee("*"),ae("as")||X(Qt.NoAsAfterImportNamespace),W(),e=Le(),t.finishImportNamespaceSpecifier(e)}function Wt(){var e,t,n=new z;return yn.inFunctionBody&&X(Qt.IllegalImportDeclaration),ne("import"),e=[],dn.type===_t.StringLiteral?(t=Lt(),oe(),n.finishImportDeclaration(e,t)):(!re("default")&&U(dn)&&(e.push(Mt()),ie(",")&&W()),ie("*")?e.push(jt()):ie("{")&&(e=e.concat(Bt())),ae("from")||X(dn.value?Qt.UnexpectedToken:Qt.MissingFromClause,dn.value),W(),t=Lt(),oe(),n.finishImportDeclaration(e,t))}function Kt(){for(var e,t,n,i,r=[];mn>cn&&(t=dn,t.type===_t.StringLiteral)&&(e=$e(),r.push(e),e.expression.type===Xt.Literal);)n=Zt.slice(t.start+1,t.end-1),"use strict"===n?(en=!0,i&&Z(i,Qt.StrictOctalLiteral)):!i&&t.octal&&(i=t);for(;mn>cn&&(e=$e(),"undefined"!=typeof e);)r.push(e);return r}function Ht(){var e,t;return K(),t=new z,e=Kt(),t.finishProgram(e)}function Vt(){var e,t,n,i=[];for(e=0;e<gn.tokens.length;++e)t=gn.tokens[e],n={type:t.type,value:t.value},t.regex&&(n.regex={pattern:t.regex.pattern,flags:t.regex.flags}),gn.range&&(n.range=t.range),gn.loc&&(n.loc=t.loc),i.push(n);gn.tokens=i}function qt(e,t){var n,i;n=String,"string"==typeof e||e instanceof String||(e=n(e)),Zt=e,nn=0,rn=Zt.length>0?1:0,an=0,cn=nn,fn=rn,hn=an,mn=Zt.length,dn=null,yn={allowIn:!0,labelSet:{},inFunctionBody:!1,inIteration:!1,inSwitch:!1,lastCommentStart:-1,curlyStack:[]},gn={},t=t||{},t.tokens=!0,gn.tokens=[],gn.tokenize=!0,gn.openParenToken=-1,gn.openCurlyToken=-1,gn.range="boolean"==typeof t.range&&t.range,gn.loc="boolean"==typeof t.loc&&t.loc,"boolean"==typeof t.comment&&t.comment&&(gn.comments=[]),"boolean"==typeof t.tolerant&&t.tolerant&&(gn.errors=[]);try{if(K(),dn.type===_t.EOF)return gn.tokens;for(W();dn.type!==_t.EOF;)try{W()}catch(r){if(gn.errors){$(r);break}throw r}Vt(),i=gn.tokens,"undefined"!=typeof gn.comments&&(i.comments=gn.comments),"undefined"!=typeof gn.errors&&(i.errors=gn.errors)}catch(a){throw a}finally{gn={}}return i}function zt(e,t){var n,i;i=String,"string"==typeof e||e instanceof String||(e=i(e)),Zt=e,nn=0,rn=Zt.length>0?1:0,an=0,cn=nn,fn=rn,hn=an,mn=Zt.length,dn=null,yn={allowIn:!0,labelSet:{},inFunctionBody:!1,inIteration:!1,inSwitch:!1,lastCommentStart:-1,curlyStack:[]},tn="script",en=!1,gn={},"undefined"!=typeof t&&(gn.range="boolean"==typeof t.range&&t.range,gn.loc="boolean"==typeof t.loc&&t.loc,gn.attachComment="boolean"==typeof t.attachComment&&t.attachComment,gn.loc&&null!==t.source&&void 0!==t.source&&(gn.source=i(t.source)),"boolean"==typeof t.tokens&&t.tokens&&(gn.tokens=[]),"boolean"==typeof t.comment&&t.comment&&(gn.comments=[]),"boolean"==typeof t.tolerant&&t.tolerant&&(gn.errors=[]),gn.attachComment&&(gn.range=!0,gn.comments=[],gn.bottomRightStack=[],gn.trailingComments=[],gn.leadingComments=[]),"module"===t.sourceType&&(tn=t.sourceType,en=!0));try{n=Ht(),"undefined"!=typeof gn.comments&&(n.comments=gn.comments),"undefined"!=typeof gn.tokens&&(Vt(),n.tokens=gn.tokens),"undefined"!=typeof gn.errors&&(n.errors=gn.errors)}catch(r){throw r}finally{gn={}}return n}var _t,$t,Gt,Xt,Jt,Qt,Yt,Zt,en,tn,nn,rn,an,sn,on,ln,un,cn,fn,hn,pn,mn,dn,yn,gn,Sn,vn,xn;_t={BooleanLiteral:1,EOF:2,Identifier:3,Keyword:4,NullLiteral:5,NumericLiteral:6,Punctuator:7,StringLiteral:8,RegularExpression:9,Template:10},$t={},$t[_t.BooleanLiteral]="Boolean",$t[_t.EOF]="<end>",$t[_t.Identifier]="Identifier",$t[_t.Keyword]="Keyword",$t[_t.NullLiteral]="Null",$t[_t.NumericLiteral]="Numeric",$t[_t.Punctuator]="Punctuator",$t[_t.StringLiteral]="String",$t[_t.RegularExpression]="RegularExpression",$t[_t.Template]="Template",Gt=["(","{","[","in","typeof","instanceof","new","return","case","delete","throw","void","=","+=","-=","*=","/=","%=","<<=",">>=",">>>=","&=","|=","^=",",","+","-","*","/","%","++","--","<<",">>",">>>","&","|","^","!","~","&&","||","?",":","===","==",">=","<=","<",">","!=","!=="],Xt={AssignmentExpression:"AssignmentExpression",AssignmentPattern:"AssignmentPattern",ArrayExpression:"ArrayExpression",ArrayPattern:"ArrayPattern",ArrowFunctionExpression:"ArrowFunctionExpression",BlockStatement:"BlockStatement",BinaryExpression:"BinaryExpression",BreakStatement:"BreakStatement",CallExpression:"CallExpression",CatchClause:"CatchClause",ClassBody:"ClassBody",ClassDeclaration:"ClassDeclaration",ClassExpression:"ClassExpression",ConditionalExpression:"ConditionalExpression",ContinueStatement:"ContinueStatement",DoWhileStatement:"DoWhileStatement",DebuggerStatement:"DebuggerStatement",EmptyStatement:"EmptyStatement",ExportAllDeclaration:"ExportAllDeclaration",ExportDefaultDeclaration:"ExportDefaultDeclaration",ExportNamedDeclaration:"ExportNamedDeclaration",ExportSpecifier:"ExportSpecifier",ExpressionStatement:"ExpressionStatement",ForStatement:"ForStatement",ForInStatement:"ForInStatement",FunctionDeclaration:"FunctionDeclaration",FunctionExpression:"FunctionExpression",Identifier:"Identifier",IfStatement:"IfStatement",ImportDeclaration:"ImportDeclaration",ImportDefaultSpecifier:"ImportDefaultSpecifier",ImportNamespaceSpecifier:"ImportNamespaceSpecifier",ImportSpecifier:"ImportSpecifier",Literal:"Literal",LabeledStatement:"LabeledStatement",LogicalExpression:"LogicalExpression",MemberExpression:"MemberExpression",MethodDefinition:"MethodDefinition",NewExpression:"NewExpression",ObjectExpression:"ObjectExpression",ObjectPattern:"ObjectPattern",Program:"Program",Property:"Property",RestElement:"RestElement",ReturnStatement:"ReturnStatement",SequenceExpression:"SequenceExpression",SpreadElement:"SpreadElement",Super:"Super",SwitchCase:"SwitchCase",SwitchStatement:"SwitchStatement",TaggedTemplateExpression:"TaggedTemplateExpression",TemplateElement:"TemplateElement",TemplateLiteral:"TemplateLiteral",ThisExpression:"ThisExpression",ThrowStatement:"ThrowStatement",TryStatement:"TryStatement",UnaryExpression:"UnaryExpression",UpdateExpression:"UpdateExpression",VariableDeclaration:"VariableDeclaration",VariableDeclarator:"VariableDeclarator",WhileStatement:"WhileStatement",WithStatement:"WithStatement"},Jt={ArrowParameterPlaceHolder:"ArrowParameterPlaceHolder"},Qt={UnexpectedToken:"Unexpected token %0",UnexpectedNumber:"Unexpected number",UnexpectedString:"Unexpected string",UnexpectedIdentifier:"Unexpected identifier",UnexpectedReserved:"Unexpected reserved word",UnexpectedTemplate:"Unexpected quasi %0",UnexpectedEOS:"Unexpected end of input",NewlineAfterThrow:"Illegal newline after throw",InvalidRegExp:"Invalid regular expression",UnterminatedRegExp:"Invalid regular expression: missing /",InvalidLHSInAssignment:"Invalid left-hand side in assignment",InvalidLHSInForIn:"Invalid left-hand side in for-in",MultipleDefaultsInSwitch:"More than one default clause in switch statement",NoCatchOrFinally:"Missing catch or finally after try",UnknownLabel:"Undefined label '%0'",Redeclaration:"%0 '%1' has already been declared",IllegalContinue:"Illegal continue statement",IllegalBreak:"Illegal break statement",IllegalReturn:"Illegal return statement",StrictModeWith:"Strict mode code may not include a with statement",StrictCatchVariable:"Catch variable may not be eval or arguments in strict mode",StrictVarName:"Variable name may not be eval or arguments in strict mode",StrictParamName:"Parameter name eval or arguments is not allowed in strict mode",StrictParamDupe:"Strict mode function may not have duplicate parameter names",StrictFunctionName:"Function name may not be eval or arguments in strict mode",StrictOctalLiteral:"Octal literals are not allowed in strict mode.",StrictDelete:"Delete of an unqualified identifier in strict mode.",StrictLHSAssignment:"Assignment to eval or arguments is not allowed in strict mode",StrictLHSPostfix:"Postfix increment/decrement may not have eval or arguments operand in strict mode",StrictLHSPrefix:"Prefix increment/decrement may not have eval or arguments operand in strict mode",StrictReservedWord:"Use of future reserved word in strict mode",TemplateOctalLiteral:"Octal literals are not allowed in template strings.",ParameterAfterRestParameter:"Rest parameter must be last formal parameter",DefaultRestParameter:"Unexpected token =",ObjectPatternAsRestParameter:"Unexpected token {",DuplicateProtoProperty:"Duplicate __proto__ fields are not allowed in object literals",ConstructorSpecialMethod:"Class constructor may not be an accessor",DuplicateConstructor:"A class may only have one constructor",StaticPrototype:"Classes may not have static property named prototype",MissingFromClause:"Unexpected token",NoAsAfterImportNamespace:"Unexpected token",InvalidModuleSpecifier:"Unexpected token",IllegalImportDeclaration:"Unexpected token",IllegalExportDeclaration:"Unexpected token"},Yt={NonAsciiIdentifierStart:new RegExp("[ªµºÀ-ÖØ-öø-ˁˆ-ˑˠ-ˤˬˮͰ-ʹͶͷͺ-ͽͿΆΈ-ΊΌΎ-ΡΣ-ϵϷ-ҁҊ-ԯԱ-Ֆՙա-ևא-תװ-ײؠ-يٮٯٱ-ۓەۥۦۮۯۺ-ۼۿܐܒ-ܯݍ-ޥޱߊ-ߪߴߵߺࠀ-ࠕࠚࠤࠨࡀ-ࡘࢠ-ࢲऄ-हऽॐक़-ॡॱ-ঀঅ-ঌএঐও-নপ-রলশ-হঽৎড়ঢ়য়-ৡৰৱਅ-ਊਏਐਓ-ਨਪ-ਰਲਲ਼ਵਸ਼ਸਹਖ਼-ੜਫ਼ੲ-ੴઅ-ઍએ-ઑઓ-નપ-રલળવ-હઽૐૠૡଅ-ଌଏଐଓ-ନପ-ରଲଳଵ-ହଽଡ଼ଢ଼ୟ-ୡୱஃஅ-ஊஎ-ஐஒ-கஙசஜஞடணதந-பம-ஹௐఅ-ఌఎ-ఐఒ-నప-హఽౘౙౠౡಅ-ಌಎ-ಐಒ-ನಪ-ಳವ-ಹಽೞೠೡೱೲഅ-ഌഎ-ഐഒ-ഺഽൎൠൡൺ-ൿඅ-ඖක-නඳ-රලව-ෆก-ะาำเ-ๆກຂຄງຈຊຍດ-ທນ-ຟມ-ຣລວສຫອ-ະາຳຽເ-ໄໆໜ-ໟༀཀ-ཇཉ-ཬྈ-ྌက-ဪဿၐ-ၕၚ-ၝၡၥၦၮ-ၰၵ-ႁႎႠ-ჅჇჍა-ჺჼ-ቈቊ-ቍቐ-ቖቘቚ-ቝበ-ኈኊ-ኍነ-ኰኲ-ኵኸ-ኾዀዂ-ዅወ-ዖዘ-ጐጒ-ጕጘ-ፚᎀ-ᎏᎠ-Ᏼᐁ-ᙬᙯ-ᙿᚁ-ᚚᚠ-ᛪᛮ-ᛸᜀ-ᜌᜎ-ᜑᜠ-ᜱᝀ-ᝑᝠ-ᝬᝮ-ᝰក-ឳៗៜᠠ-ᡷᢀ-ᢨᢪᢰ-ᣵᤀ-ᤞᥐ-ᥭᥰ-ᥴᦀ-ᦫᧁ-ᧇᨀ-ᨖᨠ-ᩔᪧᬅ-ᬳᭅ-ᭋᮃ-ᮠᮮᮯᮺ-ᯥᰀ-ᰣᱍ-ᱏᱚ-ᱽᳩ-ᳬᳮ-ᳱᳵᳶᴀ-ᶿḀ-ἕἘ-Ἕἠ-ὅὈ-Ὅὐ-ὗὙὛὝὟ-ώᾀ-ᾴᾶ-ᾼιῂ-ῄῆ-ῌῐ-ΐῖ-Ίῠ-Ῥῲ-ῴῶ-ῼⁱⁿₐ-ₜℂℇℊ-ℓℕℙ-ℝℤΩℨK-ℭℯ-ℹℼ-ℿⅅ-ⅉⅎⅠ-ↈⰀ-Ⱞⰰ-ⱞⱠ-ⳤⳫ-ⳮⳲⳳⴀ-ⴥⴧⴭⴰ-ⵧⵯⶀ-ⶖⶠ-ⶦⶨ-ⶮⶰ-ⶶⶸ-ⶾⷀ-ⷆⷈ-ⷎⷐ-ⷖⷘ-ⷞⸯ々-〇〡-〩〱-〵〸-〼ぁ-ゖゝ-ゟァ-ヺー-ヿㄅ-ㄭㄱ-ㆎㆠ-ㆺㇰ-ㇿ㐀-䶵一-鿌ꀀ-ꒌꓐ-ꓽꔀ-ꘌꘐ-ꘟꘪꘫꙀ-ꙮꙿ-ꚝꚠ-ꛯꜗ-ꜟꜢ-ꞈꞋ-ꞎꞐ-ꞭꞰꞱꟷ-ꠁꠃ-ꠅꠇ-ꠊꠌ-ꠢꡀ-ꡳꢂ-ꢳꣲ-ꣷꣻꤊ-ꤥꤰ-ꥆꥠ-ꥼꦄ-ꦲꧏꧠ-ꧤꧦ-ꧯꧺ-ꧾꨀ-ꨨꩀ-ꩂꩄ-ꩋꩠ-ꩶꩺꩾ-ꪯꪱꪵꪶꪹ-ꪽꫀꫂꫛ-ꫝꫠ-ꫪꫲ-ꫴꬁ-ꬆꬉ-ꬎꬑ-ꬖꬠ-ꬦꬨ-ꬮꬰ-ꭚꭜ-ꭟꭤꭥꯀ-ꯢ가-힣ힰ-ퟆퟋ-ퟻ豈-舘並-龎ﬀ-ﬆﬓ-ﬗיִײַ-ﬨשׁ-זּטּ-לּמּנּסּףּפּצּ-ﮱﯓ-ﴽﵐ-ﶏﶒ-ﷇﷰ-ﷻﹰ-ﹴﹶ-ﻼＡ-Ｚａ-ｚｦ-ﾾￂ-ￇￊ-ￏￒ-ￗￚ-ￜ]"),NonAsciiIdentifierPart:new RegExp("[ªµºÀ-ÖØ-öø-ˁˆ-ˑˠ-ˤˬˮ̀-ʹͶͷͺ-ͽͿΆΈ-ΊΌΎ-ΡΣ-ϵϷ-ҁ҃-҇Ҋ-ԯԱ-Ֆՙա-և֑-ׇֽֿׁׂׅׄא-תװ-ײؐ-ؚؠ-٩ٮ-ۓە-ۜ۟-۪ۨ-ۼۿܐ-݊ݍ-ޱ߀-ߵߺࠀ-࠭ࡀ-࡛ࢠ-ࢲࣤ-ॣ०-९ॱ-ঃঅ-ঌএঐও-নপ-রলশ-হ়-ৄেৈো-ৎৗড়ঢ়য়-ৣ০-ৱਁ-ਃਅ-ਊਏਐਓ-ਨਪ-ਰਲਲ਼ਵਸ਼ਸਹ਼ਾ-ੂੇੈੋ-੍ੑਖ਼-ੜਫ਼੦-ੵઁ-ઃઅ-ઍએ-ઑઓ-નપ-રલળવ-હ઼-ૅે-ૉો-્ૐૠ-ૣ૦-૯ଁ-ଃଅ-ଌଏଐଓ-ନପ-ରଲଳଵ-ହ଼-ୄେୈୋ-୍ୖୗଡ଼ଢ଼ୟ-ୣ୦-୯ୱஂஃஅ-ஊஎ-ஐஒ-கஙசஜஞடணதந-பம-ஹா-ூெ-ைொ-்ௐௗ௦-௯ఀ-ఃఅ-ఌఎ-ఐఒ-నప-హఽ-ౄె-ైొ-్ౕౖౘౙౠ-ౣ౦-౯ಁ-ಃಅ-ಌಎ-ಐಒ-ನಪ-ಳವ-ಹ಼-ೄೆ-ೈೊ-್ೕೖೞೠ-ೣ೦-೯ೱೲഁ-ഃഅ-ഌഎ-ഐഒ-ഺഽ-ൄെ-ൈൊ-ൎൗൠ-ൣ൦-൯ൺ-ൿංඃඅ-ඖක-නඳ-රලව-ෆ්ා-ුූෘ-ෟ෦-෯ෲෳก-ฺเ-๎๐-๙ກຂຄງຈຊຍດ-ທນ-ຟມ-ຣລວສຫອ-ູົ-ຽເ-ໄໆ່-ໍ໐-໙ໜ-ໟༀ༘༙༠-༩༹༵༷༾-ཇཉ-ཬཱ-྄྆-ྗྙ-ྼ࿆က-၉ၐ-ႝႠ-ჅჇჍა-ჺჼ-ቈቊ-ቍቐ-ቖቘቚ-ቝበ-ኈኊ-ኍነ-ኰኲ-ኵኸ-ኾዀዂ-ዅወ-ዖዘ-ጐጒ-ጕጘ-ፚ፝-፟ᎀ-ᎏᎠ-Ᏼᐁ-ᙬᙯ-ᙿᚁ-ᚚᚠ-ᛪᛮ-ᛸᜀ-ᜌᜎ-᜔ᜠ-᜴ᝀ-ᝓᝠ-ᝬᝮ-ᝰᝲᝳក-៓ៗៜ៝០-៩᠋-᠍᠐-᠙ᠠ-ᡷᢀ-ᢪᢰ-ᣵᤀ-ᤞᤠ-ᤫᤰ-᤻᥆-ᥭᥰ-ᥴᦀ-ᦫᦰ-ᧉ᧐-᧙ᨀ-ᨛᨠ-ᩞ᩠-᩿᩼-᪉᪐-᪙ᪧ᪰-᪽ᬀ-ᭋ᭐-᭙᭫-᭳ᮀ-᯳ᰀ-᰷᱀-᱉ᱍ-ᱽ᳐-᳔᳒-ᳶ᳸᳹ᴀ-᷵᷼-ἕἘ-Ἕἠ-ὅὈ-Ὅὐ-ὗὙὛὝὟ-ώᾀ-ᾴᾶ-ᾼιῂ-ῄῆ-ῌῐ-ΐῖ-Ίῠ-Ῥῲ-ῴῶ-ῼ‌‍‿⁀⁔ⁱⁿₐ-ₜ⃐-⃥⃜⃡-⃰ℂℇℊ-ℓℕℙ-ℝℤΩℨK-ℭℯ-ℹℼ-ℿⅅ-ⅉⅎⅠ-ↈⰀ-Ⱞⰰ-ⱞⱠ-ⳤⳫ-ⳳⴀ-ⴥⴧⴭⴰ-ⵧⵯ⵿-ⶖⶠ-ⶦⶨ-ⶮⶰ-ⶶⶸ-ⶾⷀ-ⷆⷈ-ⷎⷐ-ⷖⷘ-ⷞⷠ-ⷿⸯ々-〇〡-〯〱-〵〸-〼ぁ-ゖ゙゚ゝ-ゟァ-ヺー-ヿㄅ-ㄭㄱ-ㆎㆠ-ㆺㇰ-ㇿ㐀-䶵一-鿌ꀀ-ꒌꓐ-ꓽꔀ-ꘌꘐ-ꘫꙀ-꙯ꙴ-꙽ꙿ-ꚝꚟ-꛱ꜗ-ꜟꜢ-ꞈꞋ-ꞎꞐ-ꞭꞰꞱꟷ-ꠧꡀ-ꡳꢀ-꣄꣐-꣙꣠-ꣷꣻ꤀-꤭ꤰ-꥓ꥠ-ꥼꦀ-꧀ꧏ-꧙ꧠ-ꧾꨀ-ꨶꩀ-ꩍ꩐-꩙ꩠ-ꩶꩺ-ꫂꫛ-ꫝꫠ-ꫯꫲ-꫶ꬁ-ꬆꬉ-ꬎꬑ-ꬖꬠ-ꬦꬨ-ꬮꬰ-ꭚꭜ-ꭟꭤꭥꯀ-ꯪ꯬꯭꯰-꯹가-힣ힰ-ퟆퟋ-ퟻ豈-舘並-龎ﬀ-ﬆﬓ-ﬗיִ-ﬨשׁ-זּטּ-לּמּנּסּףּפּצּ-ﮱﯓ-ﴽﵐ-ﶏﶒ-ﷇﷰ-ﷻ︀-️︠-︭︳︴﹍-﹏ﹰ-ﹴﹶ-ﻼ０-９Ａ-Ｚ＿ａ-ｚｦ-ﾾￂ-ￇￊ-ￏￒ-ￗￚ-ￜ]")},_.prototype=z.prototype={processComment:function(){var e,t,n,i,r,a=gn.bottomRightStack,s=a[a.length-1];if(!(this.type===Xt.Program&&this.body.length>0)){if(gn.trailingComments.length>0){for(n=[],i=gn.trailingComments.length-1;i>=0;--i)r=gn.trailingComments[i],r.range[0]>=this.range[1]&&(n.unshift(r),gn.trailingComments.splice(i,1));gn.trailingComments=[]}else s&&s.trailingComments&&s.trailingComments[0].range[0]>=this.range[1]&&(n=s.trailingComments,delete s.trailingComments);if(s)for(;s&&s.range[0]>=this.range[0];)e=s,s=a.pop();if(e)e.leadingComments&&e.leadingComments[e.leadingComments.length-1].range[1]<=this.range[0]&&(this.leadingComments=e.leadingComments,e.leadingComments=void 0);else if(gn.leadingComments.length>0)for(t=[],i=gn.leadingComments.length-1;i>=0;--i)r=gn.leadingComments[i],r.range[1]<=this.range[0]&&(t.unshift(r),gn.leadingComments.splice(i,1));t&&t.length>0&&(this.leadingComments=t),n&&n.length>0&&(this.trailingComments=n),a.push(this)}},finish:function(){gn.range&&(this.range[1]=on),gn.loc&&(this.loc.end={line:ln,column:on-un},gn.source&&(this.loc.source=gn.source)),gn.attachComment&&this.processComment()},finishArrayExpression:function(e){return this.type=Xt.ArrayExpression,this.elements=e,this.finish(),this},finishArrayPattern:function(e){return this.type=Xt.ArrayPattern,this.elements=e,this.finish(),this},finishArrowFunctionExpression:function(e,t,n,i){return this.type=Xt.ArrowFunctionExpression,this.id=null,this.params=e,this.defaults=t,this.body=n,this.generator=!1,this.expression=i,this.finish(),this},finishAssignmentExpression:function(e,t,n){return this.type=Xt.AssignmentExpression,this.operator=e,this.left=t,this.right=n,this.finish(),this},finishAssignmentPattern:function(e,t){return this.type=Xt.AssignmentPattern,this.left=e,this.right=t,this.finish(),this},finishBinaryExpression:function(e,t,n){return this.type="||"===e||"&&"===e?Xt.LogicalExpression:Xt.BinaryExpression,this.operator=e,this.left=t,this.right=n,this.finish(),this},finishBlockStatement:function(e){return this.type=Xt.BlockStatement,this.body=e,this.finish(),this},finishBreakStatement:function(e){return this.type=Xt.BreakStatement,this.label=e,this.finish(),this},finishCallExpression:function(e,t){return this.type=Xt.CallExpression,this.callee=e,this.arguments=t,this.finish(),this},finishCatchClause:function(e,t){return this.type=Xt.CatchClause,this.param=e,this.body=t,this.finish(),this},finishClassBody:function(e){return this.type=Xt.ClassBody,this.body=e,this.finish(),this},finishClassDeclaration:function(e,t,n){return this.type=Xt.ClassDeclaration,this.id=e,this.superClass=t,this.body=n,this.finish(),this},finishClassExpression:function(e,t,n){return this.type=Xt.ClassExpression,this.id=e,this.superClass=t,this.body=n,this.finish(),this},finishConditionalExpression:function(e,t,n){return this.type=Xt.ConditionalExpression,this.test=e,this.consequent=t,this.alternate=n,this.finish(),this},finishContinueStatement:function(e){return this.type=Xt.ContinueStatement,this.label=e,this.finish(),this},finishDebuggerStatement:function(){return this.type=Xt.DebuggerStatement,this.finish(),this},finishDoWhileStatement:function(e,t){return this.type=Xt.DoWhileStatement,this.body=e,this.test=t,this.finish(),this},finishEmptyStatement:function(){return this.type=Xt.EmptyStatement,this.finish(),this},finishExpressionStatement:function(e){return this.type=Xt.ExpressionStatement,this.expression=e,this.finish(),this},finishForStatement:function(e,t,n,i){return this.type=Xt.ForStatement,this.init=e,this.test=t,this.update=n,this.body=i,this.finish(),this},finishForInStatement:function(e,t,n){return this.type=Xt.ForInStatement,this.left=e,this.right=t,this.body=n,this.each=!1,this.finish(),this},finishFunctionDeclaration:function(e,t,n,i){return this.type=Xt.FunctionDeclaration,this.id=e,this.params=t,this.defaults=n,this.body=i,this.generator=!1,this.expression=!1,this.finish(),this},finishFunctionExpression:function(e,t,n,i){return this.type=Xt.FunctionExpression,this.id=e,this.params=t,this.defaults=n,this.body=i,this.generator=!1,this.expression=!1,this.finish(),this},finishIdentifier:function(e){return this.type=Xt.Identifier,this.name=e,this.finish(),this},finishIfStatement:function(e,t,n){return this.type=Xt.IfStatement,this.test=e,this.consequent=t,this.alternate=n,this.finish(),this},finishLabeledStatement:function(e,t){return this.type=Xt.LabeledStatement,this.label=e,this.body=t,this.finish(),this},finishLiteral:function(e){return this.type=Xt.Literal,this.value=e.value,this.raw=Zt.slice(e.start,e.end),e.regex&&(this.regex=e.regex),this.finish(),this},finishMemberExpression:function(e,t,n){return this.type=Xt.MemberExpression,this.computed="["===e,this.object=t,this.property=n,this.finish(),this},finishNewExpression:function(e,t){return this.type=Xt.NewExpression,this.callee=e,this.arguments=t,this.finish(),this},finishObjectExpression:function(e){return this.type=Xt.ObjectExpression,this.properties=e,this.finish(),this},finishObjectPattern:function(e){return this.type=Xt.ObjectPattern,this.properties=e,this.finish(),this},finishPostfixExpression:function(e,t){return this.type=Xt.UpdateExpression,this.operator=e,this.argument=t,this.prefix=!1,this.finish(),this},finishProgram:function(e){return this.type=Xt.Program,this.body=e,"module"===tn&&(this.sourceType=tn),this.finish(),this},finishProperty:function(e,t,n,i,r,a){return this.type=Xt.Property,this.key=t,this.computed=n,this.value=i,this.kind=e,this.method=r,this.shorthand=a,this.finish(),this},finishRestElement:function(e){return this.type=Xt.RestElement,this.argument=e,this.finish(),this},finishReturnStatement:function(e){return this.type=Xt.ReturnStatement,this.argument=e,this.finish(),this},finishSequenceExpression:function(e){return this.type=Xt.SequenceExpression,this.expressions=e,this.finish(),this},finishSpreadElement:function(e){return this.type=Xt.SpreadElement,this.argument=e,this.finish(),this},finishSwitchCase:function(e,t){return this.type=Xt.SwitchCase,this.test=e,this.consequent=t,this.finish(),this},finishSuper:function(){return this.type=Xt.Super,this.finish(),this},finishSwitchStatement:function(e,t){return this.type=Xt.SwitchStatement,this.discriminant=e,this.cases=t,this.finish(),this},finishTaggedTemplateExpression:function(e,t){return this.type=Xt.TaggedTemplateExpression,this.tag=e,this.quasi=t,this.finish(),this},finishTemplateElement:function(e,t){return this.type=Xt.TemplateElement,this.value=e,this.tail=t,this.finish(),this},finishTemplateLiteral:function(e,t){return this.type=Xt.TemplateLiteral,this.quasis=e,this.expressions=t,this.finish(),this},finishThisExpression:function(){return this.type=Xt.ThisExpression,this.finish(),this},finishThrowStatement:function(e){return this.type=Xt.ThrowStatement,this.argument=e,this.finish(),this},finishTryStatement:function(e,t,n){return this.type=Xt.TryStatement,this.block=e,this.guardedHandlers=[],this.handlers=t?[t]:[],this.handler=t,this.finalizer=n,this.finish(),this},finishUnaryExpression:function(e,t){return this.type="++"===e||"--"===e?Xt.UpdateExpression:Xt.UnaryExpression,this.operator=e,this.argument=t,this.prefix=!0,this.finish(),this},finishVariableDeclaration:function(e){return this.type=Xt.VariableDeclaration,this.declarations=e,this.kind="var",this.finish(),this},finishLexicalDeclaration:function(e,t){return this.type=Xt.VariableDeclaration,this.declarations=e,this.kind=t,this.finish(),this},finishVariableDeclarator:function(e,t){return this.type=Xt.VariableDeclarator,this.id=e,this.init=t,this.finish(),this},finishWhileStatement:function(e,t){return this.type=Xt.WhileStatement,this.test=e,this.body=t,this.finish(),this},finishWithStatement:function(e,t){return this.type=Xt.WithStatement,this.object=e,this.body=t,this.finish(),this},finishExportSpecifier:function(e,t){return this.type=Xt.ExportSpecifier,this.exported=t||e,this.local=e,this.finish(),this},finishImportDefaultSpecifier:function(e){return this.type=Xt.ImportDefaultSpecifier,this.local=e,this.finish(),this},finishImportNamespaceSpecifier:function(e){return this.type=Xt.ImportNamespaceSpecifier,this.local=e,this.finish(),this},finishExportNamedDeclaration:function(e,t,n){return this.type=Xt.ExportNamedDeclaration,this.declaration=e,this.specifiers=t,this.source=n,this.finish(),this},finishExportDefaultDeclaration:function(e){return this.type=Xt.ExportDefaultDeclaration,this.declaration=e,this.finish(),this},finishExportAllDeclaration:function(e){return this.type=Xt.ExportAllDeclaration,this.source=e,this.finish(),this},finishImportSpecifier:function(e,t){return this.type=Xt.ImportSpecifier,this.local=e||t,this.imported=t,this.finish(),this},finishImportDeclaration:function(e,t){return this.type=Xt.ImportDeclaration,this.specifiers=e,this.source=t,this.finish(),this}},e.version="2.2.0",e.tokenize=qt,e.parse=zt,e.Syntax=function(){var e,t={};"function"==typeof Object.create&&(t=Object.create(null));for(e in Xt)Xt.hasOwnProperty(e)&&(t[e]=Xt[e]);return"function"==typeof Object.freeze&&Object.freeze(t),t}()});

},{}],43:[function(require,module,exports){
"use strict";function computeUrl(e,r){function t(e){".."===e?i.pop():"."!==e&&""!==e&&i.push(e)}var n="#"!==r.charAt(0)&&-1===r.indexOf(":"),i="/"===(e||"").charAt(0)?[""]:[],o=r.split("#")[0].split("/");return _.each((e||"").split("#")[0].split("/"),t),n?_.each(o,t):i=o,i.join("/")}function getRemoteJson(e,r,t){var n,i=computeUrl(r.location,e),o=remoteCache[i];_.isUndefined(o)?(n=pathLoader.load(i,r),n=r.processContent?n.then(function(e){return r.processContent(e,i)}):n.then(JSON.parse),n.then(function(e){return remoteCache[i]=e,e}).then(function(e){t(void 0,e)},function(e){t(e)})):t(void 0,o)}"undefined"==typeof Promise&&require("native-promise-only");var _={cloneDeep:require("lodash-compat/lang/cloneDeep"),each:require("lodash-compat/collection/each"),indexOf:require("lodash-compat/array/indexOf"),isArray:require("lodash-compat/lang/isArray"),isError:require("lodash-compat/lang/isError"),isFunction:require("lodash-compat/lang/isFunction"),isNumber:require("lodash-compat/lang/isNumber"),isPlainObject:require("lodash-compat/lang/isPlainObject"),isString:require("lodash-compat/lang/isString"),isUndefined:require("lodash-compat/lang/isUndefined"),keys:require("lodash-compat/object/keys"),lastIndexOf:require("lodash-compat/array/lastIndexOf"),map:require("lodash-compat/collection/map"),reduce:require("lodash-compat/collection/reduce"),size:require("lodash-compat/collection/size"),times:require("lodash-compat/utility/times")},pathLoader=require("path-loader"),traverse=require("traverse"),remoteCache={},supportedSchemes=["file","http","https"];module.exports.clearCache=function(){remoteCache={}};var isJsonReference=module.exports.isJsonReference=function(e){return _.isPlainObject(e)&&_.isString(e.$ref)},pathToPointer=module.exports.pathToPointer=function(e){if(_.isUndefined(e))throw new Error("path is required");if(!_.isArray(e))throw new Error("path must be an array");var r="#";return e.length>0&&(r+="/"+_.map(e,function(e){return e.replace(/~/g,"~0").replace(/\//g,"~1")}).join("/")),r},findRefs=module.exports.findRefs=function(e){if(_.isUndefined(e))throw new Error("json is required");if(!_.isPlainObject(e))throw new Error("json must be an object");return traverse(e).reduce(function(e){var r=this.node;return"$ref"===this.key&&isJsonReference(this.parent.node)&&(e[pathToPointer(this.path)]=r),e},{})},isRemotePointer=module.exports.isRemotePointer=function(e){if(_.isUndefined(e))throw new Error("ptr is required");if(!_.isString(e))throw new Error("ptr must be a string");return""!==e&&-1===_.indexOf(["#"],e.charAt(0))},pathFromPointer=module.exports.pathFromPointer=function(e){if(_.isUndefined(e))throw new Error("ptr is required");if(!_.isString(e))throw new Error("ptr must be a string");var r=[],t=["","#","#/"];return isRemotePointer(e)?r=e:-1===_.indexOf(t,e)&&"#"===e.charAt(0)&&(r=_.reduce(e.substring(e.indexOf("/")).split("/"),function(e,r){return""!==r&&e.push(r.replace(/~0/g,"~").replace(/~1/g,"/")),e},[])),r};module.exports.resolveRefs=function e(r,t,n){function i(e){var r=[],t=e.map(function(){var e=pathToPointer(this.path);this.circular&&(r.push(e),0===c?this.update({}):this.update(traverse(this.node).map(function(){this.circular&&this.parent.update({})})))});return _.each(r,function(e){var r=[],n=pathFromPointer(e),i=traverse(t).get(n);_.times(c,function(){r.push.apply(r,n),traverse(t).set(r,_.cloneDeep(i))})}),t}function o(e,r,t,n){var i,o,s,a=_.isError(r),c=!1,u={ref:t};a?(c=!0,s=void 0,u.err=r):(t=-1===t.indexOf("#")?"#":t.substring(t.indexOf("#")),c=!r.has(pathFromPointer(t)),s=r.get(pathFromPointer(t))),o=pathFromPointer(n),i=o.slice(0,o.length-1),c||(0===i.length?e.value=s:e.set(i,s),u.value=s),p[n]=u}if(arguments.length<3?(n=arguments[1],t={}):_.isUndefined(t)&&(t={}),_.isUndefined(r))throw new Error("json is required");if(!_.isPlainObject(r))throw new Error("json must be an object");if(!_.isPlainObject(t))throw new Error("options must be an object");if(_.isUndefined(n))throw new Error("done is required");if(!_.isUndefined(n)&&!_.isFunction(n))throw new Error("done must be a function");if(!_.isUndefined(t.processContent)&&!_.isFunction(t.processContent))throw new Error("options.processContent must be a function");if(!_.isUndefined(t.location)&&!_.isString(t.location))throw new Error("options.location must be a string");if(!_.isUndefined(t.depth)&&!_.isNumber(t.depth))throw new Error("options.depth must be a number");if(!_.isUndefined(t.depth)&&t.depth<0)throw new Error("options.depth must be greater or equal to zero");var s,a,c=_.isUndefined(t.depth)?1:t.depth,u={},d=findRefs(r),p={};Object.keys(d).length>0?(a=traverse(_.cloneDeep(r)),_.each(d,function(e,r){isRemotePointer(e)?u[r]=e:o(a,a,e,r)}),_.size(u)>0?(s=Promise.resolve(),_.each(u,function(r,n){var i,c=-1===_.indexOf(r,":")?void 0:r.split(":")[0];i=-1!==_.indexOf(supportedSchemes,c)||_.isUndefined(c)?new Promise(function(i,s){getRemoteJson(r,t,function(c,u){var d=_.cloneDeep(t),p=r.split("#")[0];p=p.substring(0,_.lastIndexOf(p,"/")+1),d.location=computeUrl(t.location,p),c?(o(a,c,r,n),i()):e(u,d,function(e,t){e?s(e):(o(a,traverse(t),r,n),i())})})}):Promise.resolve(),s=s.then(function(){return i})}),s.then(function(){n(void 0,i(a),p)},function(e){n(e)})):n(void 0,i(a),p)):n(void 0,r,p)};

},{"lodash-compat/array/indexOf":50,"lodash-compat/array/lastIndexOf":52,"lodash-compat/collection/each":55,"lodash-compat/collection/map":58,"lodash-compat/collection/reduce":59,"lodash-compat/collection/size":60,"lodash-compat/lang/cloneDeep":129,"lodash-compat/lang/isArray":131,"lodash-compat/lang/isError":134,"lodash-compat/lang/isFunction":136,"lodash-compat/lang/isNumber":139,"lodash-compat/lang/isPlainObject":141,"lodash-compat/lang/isString":142,"lodash-compat/lang/isUndefined":144,"lodash-compat/object/keys":146,"lodash-compat/utility/times":152,"native-promise-only":44,"path-loader":45,"traverse":204}],44:[function(require,module,exports){
(function (global){
!function(t,n,e){n[t]=n[t]||e(),"undefined"!=typeof module&&module.exports?module.exports=n[t]:"function"==typeof define&&define.amd&&define(function(){return n[t]})}("Promise","undefined"!=typeof global?global:this,function(){"use strict";function t(t,n){l.add(t,n),h||(h=y(l.drain))}function n(t){var n,e=typeof t;return null==t||"object"!=e&&"function"!=e||(n=t.then),"function"==typeof n?n:!1}function e(){for(var t=0;t<this.chain.length;t++)o(this,1===this.state?this.chain[t].success:this.chain[t].failure,this.chain[t]);this.chain.length=0}function o(t,e,o){var r,i;try{e===!1?o.reject(t.msg):(r=e===!0?t.msg:e.call(void 0,t.msg),r===o.promise?o.reject(TypeError("Promise-chain cycle")):(i=n(r))?i.call(r,o.resolve,o.reject):o.resolve(r))}catch(c){o.reject(c)}}function r(o){var c,u=this;if(!u.triggered){u.triggered=!0,u.def&&(u=u.def);try{(c=n(o))?t(function(){var t=new f(u);try{c.call(o,function(){r.apply(t,arguments)},function(){i.apply(t,arguments)})}catch(n){i.call(t,n)}}):(u.msg=o,u.state=1,u.chain.length>0&&t(e,u))}catch(a){i.call(new f(u),a)}}}function i(n){var o=this;o.triggered||(o.triggered=!0,o.def&&(o=o.def),o.msg=n,o.state=2,o.chain.length>0&&t(e,o))}function c(t,n,e,o){for(var r=0;r<n.length;r++)!function(r){t.resolve(n[r]).then(function(t){e(r,t)},o)}(r)}function f(t){this.def=t,this.triggered=!1}function u(t){this.promise=t,this.state=0,this.triggered=!1,this.chain=[],this.msg=void 0}function a(n){if("function"!=typeof n)throw TypeError("Not a function");if(0!==this.__NPO__)throw TypeError("Not a promise");this.__NPO__=1;var o=new u(this);this.then=function(n,r){var i={success:"function"==typeof n?n:!0,failure:"function"==typeof r?r:!1};return i.promise=new this.constructor(function(t,n){if("function"!=typeof t||"function"!=typeof n)throw TypeError("Not a function");i.resolve=t,i.reject=n}),o.chain.push(i),0!==o.state&&t(e,o),i.promise},this["catch"]=function(t){return this.then(void 0,t)};try{n.call(void 0,function(t){r.call(o,t)},function(t){i.call(o,t)})}catch(c){i.call(o,c)}}var s,h,l,p=Object.prototype.toString,y="undefined"!=typeof setImmediate?function(t){return setImmediate(t)}:setTimeout;try{Object.defineProperty({},"x",{}),s=function(t,n,e,o){return Object.defineProperty(t,n,{value:e,writable:!0,configurable:o!==!1})}}catch(d){s=function(t,n,e){return t[n]=e,t}}l=function(){function t(t,n){this.fn=t,this.self=n,this.next=void 0}var n,e,o;return{add:function(r,i){o=new t(r,i),e?e.next=o:n=o,e=o,o=void 0},drain:function(){var t=n;for(n=e=h=void 0;t;)t.fn.call(t.self),t=t.next}}}();var g=s({},"constructor",a,!1);return a.prototype=g,s(g,"__NPO__",0,!1),s(a,"resolve",function(t){var n=this;return t&&"object"==typeof t&&1===t.__NPO__?t:new n(function(n,e){if("function"!=typeof n||"function"!=typeof e)throw TypeError("Not a function");n(t)})}),s(a,"reject",function(t){return new this(function(n,e){if("function"!=typeof n||"function"!=typeof e)throw TypeError("Not a function");e(t)})}),s(a,"all",function(t){var n=this;return"[object Array]"!=p.call(t)?n.reject(TypeError("Not an array")):0===t.length?n.resolve([]):new n(function(e,o){if("function"!=typeof e||"function"!=typeof o)throw TypeError("Not a function");var r=t.length,i=Array(r),f=0;c(n,t,function(t,n){i[t]=n,++f===r&&e(i)},o)})}),s(a,"race",function(t){var n=this;return"[object Array]"!=p.call(t)?n.reject(TypeError("Not an array")):new n(function(e,o){if("function"!=typeof e||"function"!=typeof o)throw TypeError("Not a function");c(n,t,function(t,n){e(n)},o)})}),a});

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],45:[function(require,module,exports){
"use strict";function getLoader(e){return supportedLoaders[e.split(":")[0]]||defaultLoader}var supportedLoaders={file:require("./lib/loaders/file"),http:require("./lib/loaders/http"),https:require("./lib/loaders/http")},defaultLoader="undefined"==typeof window?supportedLoaders.file:supportedLoaders.http;"undefined"==typeof Promise&&require("native-promise-only"),module.exports.load=function(e,t,o){var r=Promise.resolve();return 2===arguments.length&&"function"==typeof t&&(o=t,t=void 0),r=r.then(function(){if("undefined"==typeof e)throw new TypeError("location is required");if("string"!=typeof e)throw new TypeError("location must be a string");if("undefined"!=typeof t){if("object"!=typeof t)throw new TypeError("options must be an object")}else t={};if("undefined"!=typeof o&&"function"!=typeof o)throw new TypeError("callback must be a function")}),r=r.then(function(){return new Promise(function(o,r){var n=getLoader(e);n.load(e,t,function(e,t){e?r(e):o(t)})})}),"function"==typeof o&&(r=r.then(function(e){o(void 0,e)},function(e){o(e)})),r};

},{"./lib/loaders/file":46,"./lib/loaders/http":47,"native-promise-only":48}],46:[function(require,module,exports){
"use strict";module.exports.load=function(e,o,r){r(new TypeError("The 'file' scheme is not supported in the browser"))};

},{}],47:[function(require,module,exports){
"use strict";var request=require("superagent"),supportedHttpMethods=["delete","get","head","patch","post","put"];module.exports.load=function(e,t,o){var p,r,s=e.split("#")[0],d=t.method?t.method.toLowerCase():"get";"undefined"!=typeof t.prepareRequest&&"function"!=typeof t.prepareRequest?p=new TypeError("options.prepareRequest must be a function"):"undefined"!=typeof t.method&&("string"!=typeof t.method?p=new TypeError("options.method must be a string"):-1===supportedHttpMethods.indexOf(t.method)&&(p=new TypeError("options.method must be one of the following: "+supportedHttpMethods.slice(0,supportedHttpMethods.length-1).join(", ")+" or "+supportedHttpMethods[supportedHttpMethods.length-1]))),p?o(p):(r=request["delete"===d?"del":d](s),t.prepareRequest&&t.prepareRequest(r),"function"==typeof r.buffer&&r.buffer(!0),r.end(function(e,t){o(e,t?t.text:t)}))};

},{"superagent":154}],48:[function(require,module,exports){
(function (global){
!function(t,n,e){n[t]=n[t]||e(),"undefined"!=typeof module&&module.exports?module.exports=n[t]:"function"==typeof define&&define.amd&&define(function(){return n[t]})}("Promise","undefined"!=typeof global?global:this,function(){"use strict";function t(t,n){l.add(t,n),h||(h=y(l.drain))}function n(t){var n,e=typeof t;return null==t||"object"!=e&&"function"!=e||(n=t.then),"function"==typeof n?n:!1}function e(){for(var t=0;t<this.chain.length;t++)o(this,1===this.state?this.chain[t].success:this.chain[t].failure,this.chain[t]);this.chain.length=0}function o(t,e,o){var r,i;try{e===!1?o.reject(t.msg):(r=e===!0?t.msg:e.call(void 0,t.msg),r===o.promise?o.reject(TypeError("Promise-chain cycle")):(i=n(r))?i.call(r,o.resolve,o.reject):o.resolve(r))}catch(c){o.reject(c)}}function r(o){var c,u,a=this;if(!a.triggered){a.triggered=!0,a.def&&(a=a.def);try{(c=n(o))?(u=new f(a),c.call(o,function(){r.apply(u,arguments)},function(){i.apply(u,arguments)})):(a.msg=o,a.state=1,a.chain.length>0&&t(e,a))}catch(s){i.call(u||new f(a),s)}}}function i(n){var o=this;o.triggered||(o.triggered=!0,o.def&&(o=o.def),o.msg=n,o.state=2,o.chain.length>0&&t(e,o))}function c(t,n,e,o){for(var r=0;r<n.length;r++)!function(r){t.resolve(n[r]).then(function(t){e(r,t)},o)}(r)}function f(t){this.def=t,this.triggered=!1}function u(t){this.promise=t,this.state=0,this.triggered=!1,this.chain=[],this.msg=void 0}function a(n){if("function"!=typeof n)throw TypeError("Not a function");if(0!==this.__NPO__)throw TypeError("Not a promise");this.__NPO__=1;var o=new u(this);this.then=function(n,r){var i={success:"function"==typeof n?n:!0,failure:"function"==typeof r?r:!1};return i.promise=new this.constructor(function(t,n){if("function"!=typeof t||"function"!=typeof n)throw TypeError("Not a function");i.resolve=t,i.reject=n}),o.chain.push(i),0!==o.state&&t(e,o),i.promise},this["catch"]=function(t){return this.then(void 0,t)};try{n.call(void 0,function(t){r.call(o,t)},function(t){i.call(o,t)})}catch(c){i.call(o,c)}}var s,h,l,p=Object.prototype.toString,y="undefined"!=typeof setImmediate?function(t){return setImmediate(t)}:setTimeout;try{Object.defineProperty({},"x",{}),s=function(t,n,e,o){return Object.defineProperty(t,n,{value:e,writable:!0,configurable:o!==!1})}}catch(d){s=function(t,n,e){return t[n]=e,t}}l=function(){function t(t,n){this.fn=t,this.self=n,this.next=void 0}var n,e,o;return{add:function(r,i){o=new t(r,i),e?e.next=o:n=o,e=o,o=void 0},drain:function(){var t=n;for(n=e=h=void 0;t;)t.fn.call(t.self),t=t.next}}}();var g=s({},"constructor",a,!1);return a.prototype=g,s(g,"__NPO__",0,!1),s(a,"resolve",function(t){var n=this;return t&&"object"==typeof t&&1===t.__NPO__?t:new n(function(n,e){if("function"!=typeof n||"function"!=typeof e)throw TypeError("Not a function");n(t)})}),s(a,"reject",function(t){return new this(function(n,e){if("function"!=typeof n||"function"!=typeof e)throw TypeError("Not a function");e(t)})}),s(a,"all",function(t){var n=this;return"[object Array]"!=p.call(t)?n.reject(TypeError("Not an array")):0===t.length?n.resolve([]):new n(function(e,o){if("function"!=typeof e||"function"!=typeof o)throw TypeError("Not a function");var r=t.length,i=Array(r),f=0;c(n,t,function(t,n){i[t]=n,++f===r&&e(i)},o)})}),s(a,"race",function(t){var n=this;return"[object Array]"!=p.call(t)?n.reject(TypeError("Not an array")):new n(function(e,o){if("function"!=typeof e||"function"!=typeof o)throw TypeError("Not a function");c(n,t,function(t,n){e(n)},o)})}),a});

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],49:[function(require,module,exports){
var baseDifference=require("../internal/baseDifference"),baseFlatten=require("../internal/baseFlatten"),isArrayLike=require("../internal/isArrayLike"),isObjectLike=require("../internal/isObjectLike"),restParam=require("../function/restParam"),difference=restParam(function(e,r){return isObjectLike(e)&&isArrayLike(e)?baseDifference(e,baseFlatten(r,!1,!0)):[]});module.exports=difference;

},{"../function/restParam":61,"../internal/baseDifference":73,"../internal/baseFlatten":77,"../internal/isArrayLike":117,"../internal/isObjectLike":123}],50:[function(require,module,exports){
function indexOf(e,n,r){var a=e?e.length:0;if(!a)return-1;if("number"==typeof r)r=0>r?nativeMax(a+r,0):r;else if(r){var i=binaryIndex(e,n);return a>i&&(n===n?n===e[i]:e[i]!==e[i])?i:-1}return baseIndexOf(e,n,r||0)}var baseIndexOf=require("../internal/baseIndexOf"),binaryIndex=require("../internal/binaryIndex"),nativeMax=Math.max;module.exports=indexOf;

},{"../internal/baseIndexOf":82,"../internal/binaryIndex":95}],51:[function(require,module,exports){
function last(t){var e=t?t.length:0;return e?t[e-1]:void 0}module.exports=last;

},{}],52:[function(require,module,exports){
function lastIndexOf(n,e,r){var a=n?n.length:0;if(!a)return-1;var i=a;if("number"==typeof r)i=(0>r?nativeMax(a+r,0):nativeMin(r||0,a-1))+1;else if(r){i=binaryIndex(n,e,!0)-1;var t=n[i];return(e===e?e===t:t!==t)?i:-1}if(e!==e)return indexOfNaN(n,i,!0);for(;i--;)if(n[i]===e)return i;return-1}var binaryIndex=require("../internal/binaryIndex"),indexOfNaN=require("../internal/indexOfNaN"),nativeMax=Math.max,nativeMin=Math.min;module.exports=lastIndexOf;

},{"../internal/binaryIndex":95,"../internal/indexOfNaN":113}],53:[function(require,module,exports){
var baseFlatten=require("../internal/baseFlatten"),baseUniq=require("../internal/baseUniq"),restParam=require("../function/restParam"),union=restParam(function(e){return baseUniq(baseFlatten(e,!1,!0))});module.exports=union;

},{"../function/restParam":61,"../internal/baseFlatten":77,"../internal/baseUniq":94}],54:[function(require,module,exports){
function uniq(e,a,l,n){var r=e?e.length:0;return r?(null!=a&&"boolean"!=typeof a&&(n=l,l=isIterateeCall(e,a,n)?void 0:a,a=!1),l=null==l?l:baseCallback(l,n,3),a?sortedUniq(e,l):baseUniq(e,l)):[]}var baseCallback=require("../internal/baseCallback"),baseUniq=require("../internal/baseUniq"),isIterateeCall=require("../internal/isIterateeCall"),sortedUniq=require("../internal/sortedUniq");module.exports=uniq;

},{"../internal/baseCallback":70,"../internal/baseUniq":94,"../internal/isIterateeCall":120,"../internal/sortedUniq":126}],55:[function(require,module,exports){
module.exports=require("./forEach");

},{"./forEach":57}],56:[function(require,module,exports){
var baseEach=require("../internal/baseEach"),createFind=require("../internal/createFind"),find=createFind(baseEach);module.exports=find;

},{"../internal/baseEach":74,"../internal/createFind":104}],57:[function(require,module,exports){
var arrayEach=require("../internal/arrayEach"),baseEach=require("../internal/baseEach"),createForEach=require("../internal/createForEach"),forEach=createForEach(arrayEach,baseEach);module.exports=forEach;

},{"../internal/arrayEach":64,"../internal/baseEach":74,"../internal/createForEach":105}],58:[function(require,module,exports){
function map(a,r,e){var i=isArray(a)?arrayMap:baseMap;return r=baseCallback(r,e,3),i(a,r)}var arrayMap=require("../internal/arrayMap"),baseCallback=require("../internal/baseCallback"),baseMap=require("../internal/baseMap"),isArray=require("../lang/isArray");module.exports=map;

},{"../internal/arrayMap":65,"../internal/baseCallback":70,"../internal/baseMap":86,"../lang/isArray":131}],59:[function(require,module,exports){
var arrayReduce=require("../internal/arrayReduce"),baseEach=require("../internal/baseEach"),createReduce=require("../internal/createReduce"),reduce=createReduce(arrayReduce,baseEach);module.exports=reduce;

},{"../internal/arrayReduce":67,"../internal/baseEach":74,"../internal/createReduce":106}],60:[function(require,module,exports){
function size(e){var t=e?getLength(e):0;return isLength(t)?t:keys(e).length}var getLength=require("../internal/getLength"),isLength=require("../internal/isLength"),keys=require("../object/keys");module.exports=size;

},{"../internal/getLength":110,"../internal/isLength":122,"../object/keys":146}],61:[function(require,module,exports){
function restParam(r,t){if("function"!=typeof r)throw new TypeError(FUNC_ERROR_TEXT);return t=nativeMax(void 0===t?r.length-1:+t||0,0),function(){for(var a=arguments,e=-1,n=nativeMax(a.length-t,0),i=Array(n);++e<n;)i[e]=a[t+e];switch(t){case 0:return r.call(this,i);case 1:return r.call(this,a[0],i);case 2:return r.call(this,a[0],a[1],i)}var c=Array(t+1);for(e=-1;++e<t;)c[e]=a[e];return c[t]=i,r.apply(this,c)}}var FUNC_ERROR_TEXT="Expected a function",nativeMax=Math.max;module.exports=restParam;

},{}],62:[function(require,module,exports){
(function (global){
function SetCache(e){var t=e?e.length:0;for(this.data={hash:nativeCreate(null),set:new Set};t--;)this.push(e[t])}var cachePush=require("./cachePush"),getNative=require("./getNative"),Set=getNative(global,"Set"),nativeCreate=getNative(Object,"create");SetCache.prototype.push=cachePush,module.exports=SetCache;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./cachePush":100,"./getNative":112}],63:[function(require,module,exports){
function arrayCopy(r,a){var o=-1,y=r.length;for(a||(a=Array(y));++o<y;)a[o]=r[o];return a}module.exports=arrayCopy;

},{}],64:[function(require,module,exports){
function arrayEach(r,a){for(var e=-1,n=r.length;++e<n&&a(r[e],e,r)!==!1;);return r}module.exports=arrayEach;

},{}],65:[function(require,module,exports){
function arrayMap(r,a){for(var e=-1,n=r.length,o=Array(n);++e<n;)o[e]=a(r[e],e,r);return o}module.exports=arrayMap;

},{}],66:[function(require,module,exports){
function arrayPush(r,a){for(var e=-1,n=a.length,t=r.length;++e<n;)r[t+e]=a[e];return r}module.exports=arrayPush;

},{}],67:[function(require,module,exports){
function arrayReduce(r,e,a,u){var n=-1,o=r.length;for(u&&o&&(a=r[++n]);++n<o;)a=e(a,r[n],n,r);return a}module.exports=arrayReduce;

},{}],68:[function(require,module,exports){
function arraySome(r,e){for(var o=-1,a=r.length;++o<a;)if(e(r[o],o,r))return!0;return!1}module.exports=arraySome;

},{}],69:[function(require,module,exports){
function baseAssign(e,s){return null==s?e:baseCopy(s,keys(s),e)}var baseCopy=require("./baseCopy"),keys=require("../object/keys");module.exports=baseAssign;

},{"../object/keys":146,"./baseCopy":72}],70:[function(require,module,exports){
function baseCallback(e,t,r){var a=typeof e;return"function"==a?void 0===t?e:bindCallback(e,t,r):null==e?identity:"object"==a?baseMatches(e):void 0===t?property(e):baseMatchesProperty(e,t)}var baseMatches=require("./baseMatches"),baseMatchesProperty=require("./baseMatchesProperty"),bindCallback=require("./bindCallback"),identity=require("../utility/identity"),property=require("../utility/property");module.exports=baseCallback;

},{"../utility/identity":150,"../utility/property":151,"./baseMatches":87,"./baseMatchesProperty":88,"./bindCallback":97}],71:[function(require,module,exports){
function baseClone(a,e,r,t,o,n,g){var l;if(r&&(l=o?r(a,t,o):r(a)),void 0!==l)return l;if(!isObject(a))return a;var b=isArray(a);if(b){if(l=initCloneArray(a),!e)return arrayCopy(a,l)}else{var T=objToString.call(a),i=T==funcTag;if(T!=objectTag&&T!=argsTag&&(!i||o))return cloneableTags[T]?initCloneByTag(a,T,e):o?a:{};if(isHostObject(a))return o?a:{};if(l=initCloneObject(i?{}:a),!e)return baseAssign(l,a)}n||(n=[]),g||(g=[]);for(var c=n.length;c--;)if(n[c]==a)return g[c];return n.push(a),g.push(l),(b?arrayEach:baseForOwn)(a,function(t,o){l[o]=baseClone(t,e,r,o,a,n,g)}),l}var arrayCopy=require("./arrayCopy"),arrayEach=require("./arrayEach"),baseAssign=require("./baseAssign"),baseForOwn=require("./baseForOwn"),initCloneArray=require("./initCloneArray"),initCloneByTag=require("./initCloneByTag"),initCloneObject=require("./initCloneObject"),isArray=require("../lang/isArray"),isHostObject=require("./isHostObject"),isObject=require("../lang/isObject"),argsTag="[object Arguments]",arrayTag="[object Array]",boolTag="[object Boolean]",dateTag="[object Date]",errorTag="[object Error]",funcTag="[object Function]",mapTag="[object Map]",numberTag="[object Number]",objectTag="[object Object]",regexpTag="[object RegExp]",setTag="[object Set]",stringTag="[object String]",weakMapTag="[object WeakMap]",arrayBufferTag="[object ArrayBuffer]",float32Tag="[object Float32Array]",float64Tag="[object Float64Array]",int8Tag="[object Int8Array]",int16Tag="[object Int16Array]",int32Tag="[object Int32Array]",uint8Tag="[object Uint8Array]",uint8ClampedTag="[object Uint8ClampedArray]",uint16Tag="[object Uint16Array]",uint32Tag="[object Uint32Array]",cloneableTags={};cloneableTags[argsTag]=cloneableTags[arrayTag]=cloneableTags[arrayBufferTag]=cloneableTags[boolTag]=cloneableTags[dateTag]=cloneableTags[float32Tag]=cloneableTags[float64Tag]=cloneableTags[int8Tag]=cloneableTags[int16Tag]=cloneableTags[int32Tag]=cloneableTags[numberTag]=cloneableTags[objectTag]=cloneableTags[regexpTag]=cloneableTags[stringTag]=cloneableTags[uint8Tag]=cloneableTags[uint8ClampedTag]=cloneableTags[uint16Tag]=cloneableTags[uint32Tag]=!0,cloneableTags[errorTag]=cloneableTags[funcTag]=cloneableTags[mapTag]=cloneableTags[setTag]=cloneableTags[weakMapTag]=!1;var objectProto=Object.prototype,objToString=objectProto.toString;module.exports=baseClone;

},{"../lang/isArray":131,"../lang/isObject":140,"./arrayCopy":63,"./arrayEach":64,"./baseAssign":69,"./baseForOwn":80,"./initCloneArray":114,"./initCloneByTag":115,"./initCloneObject":116,"./isHostObject":118}],72:[function(require,module,exports){
function baseCopy(e,o,r){r||(r={});for(var a=-1,n=o.length;++a<n;){var t=o[a];r[t]=e[t]}return r}module.exports=baseCopy;

},{}],73:[function(require,module,exports){
function baseDifference(e,r){var a=e?e.length:0,n=[];if(!a)return n;var c=-1,f=baseIndexOf,h=!0,t=h&&r.length>=LARGE_ARRAY_SIZE?createCache(r):null,u=r.length;t&&(f=cacheIndexOf,h=!1,r=t);e:for(;++c<a;){var i=e[c];if(h&&i===i){for(var s=u;s--;)if(r[s]===i)continue e;n.push(i)}else f(r,i,0)<0&&n.push(i)}return n}var baseIndexOf=require("./baseIndexOf"),cacheIndexOf=require("./cacheIndexOf"),createCache=require("./createCache"),LARGE_ARRAY_SIZE=200;module.exports=baseDifference;

},{"./baseIndexOf":82,"./cacheIndexOf":99,"./createCache":103}],74:[function(require,module,exports){
var baseForOwn=require("./baseForOwn"),createBaseEach=require("./createBaseEach"),baseEach=createBaseEach(baseForOwn);module.exports=baseEach;

},{"./baseForOwn":80,"./createBaseEach":101}],75:[function(require,module,exports){
function baseFind(n,e,r,i){var o;return r(n,function(n,r,t){return e(n,r,t)?(o=i?r:n,!1):void 0}),o}module.exports=baseFind;

},{}],76:[function(require,module,exports){
function baseFindIndex(e,n,r){for(var d=e.length,t=r?d:-1;r?t--:++t<d;)if(n(e[t],t,e))return t;return-1}module.exports=baseFindIndex;

},{}],77:[function(require,module,exports){
function baseFlatten(r,e,i,a){a||(a=[]);for(var s=-1,t=r.length;++s<t;){var u=r[s];isObjectLike(u)&&isArrayLike(u)&&(i||isArray(u)||isArguments(u))?e?baseFlatten(u,e,i,a):arrayPush(a,u):i||(a[a.length]=u)}return a}var arrayPush=require("./arrayPush"),isArguments=require("../lang/isArguments"),isArray=require("../lang/isArray"),isArrayLike=require("./isArrayLike"),isObjectLike=require("./isObjectLike");module.exports=baseFlatten;

},{"../lang/isArguments":130,"../lang/isArray":131,"./arrayPush":66,"./isArrayLike":117,"./isObjectLike":123}],78:[function(require,module,exports){
var createBaseFor=require("./createBaseFor"),baseFor=createBaseFor();module.exports=baseFor;

},{"./createBaseFor":102}],79:[function(require,module,exports){
function baseForIn(e,r){return baseFor(e,r,keysIn)}var baseFor=require("./baseFor"),keysIn=require("../object/keysIn");module.exports=baseForIn;

},{"../object/keysIn":147,"./baseFor":78}],80:[function(require,module,exports){
function baseForOwn(e,r){return baseFor(e,r,keys)}var baseFor=require("./baseFor"),keys=require("../object/keys");module.exports=baseForOwn;

},{"../object/keys":146,"./baseFor":78}],81:[function(require,module,exports){
function baseGet(e,t,o){if(null!=e){e=toObject(e),void 0!==o&&o in e&&(t=[o]);for(var r=0,n=t.length;null!=e&&n>r;)e=toObject(e)[t[r++]];return r&&r==n?e:void 0}}var toObject=require("./toObject");module.exports=baseGet;

},{"./toObject":127}],82:[function(require,module,exports){
function baseIndexOf(e,r,n){if(r!==r)return indexOfNaN(e,n);for(var f=n-1,a=e.length;++f<a;)if(e[f]===r)return f;return-1}var indexOfNaN=require("./indexOfNaN");module.exports=baseIndexOf;

},{"./indexOfNaN":113}],83:[function(require,module,exports){
function baseIsEqual(e,s,a,u,i,b){return e===s?!0:null==e||null==s||!isObject(e)&&!isObjectLike(s)?e!==e&&s!==s:baseIsEqualDeep(e,s,baseIsEqual,a,u,i,b)}var baseIsEqualDeep=require("./baseIsEqualDeep"),isObject=require("../lang/isObject"),isObjectLike=require("./isObjectLike");module.exports=baseIsEqual;

},{"../lang/isObject":140,"./baseIsEqualDeep":84,"./isObjectLike":123}],84:[function(require,module,exports){
function baseIsEqualDeep(r,e,a,t,o,s,u){var i=isArray(r),b=isArray(e),c=arrayTag,g=arrayTag;i||(c=objToString.call(r),c==argsTag?c=objectTag:c!=objectTag&&(i=isTypedArray(r))),b||(g=objToString.call(e),g==argsTag?g=objectTag:g!=objectTag&&(b=isTypedArray(e)));var y=c==objectTag&&!isHostObject(r),j=g==objectTag&&!isHostObject(e),l=c==g;if(l&&!i&&!y)return equalByTag(r,e,c);if(!o){var p=y&&hasOwnProperty.call(r,"__wrapped__"),T=j&&hasOwnProperty.call(e,"__wrapped__");if(p||T)return a(p?r.value():r,T?e.value():e,t,o,s,u)}if(!l)return!1;s||(s=[]),u||(u=[]);for(var n=s.length;n--;)if(s[n]==r)return u[n]==e;s.push(r),u.push(e);var q=(i?equalArrays:equalObjects)(r,e,a,t,o,s,u);return s.pop(),u.pop(),q}var equalArrays=require("./equalArrays"),equalByTag=require("./equalByTag"),equalObjects=require("./equalObjects"),isArray=require("../lang/isArray"),isHostObject=require("./isHostObject"),isTypedArray=require("../lang/isTypedArray"),argsTag="[object Arguments]",arrayTag="[object Array]",objectTag="[object Object]",objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty,objToString=objectProto.toString;module.exports=baseIsEqualDeep;

},{"../lang/isArray":131,"../lang/isTypedArray":143,"./equalArrays":107,"./equalByTag":108,"./equalObjects":109,"./isHostObject":118}],85:[function(require,module,exports){
function baseIsMatch(e,r,t){var a=r.length,i=a,u=!t;if(null==e)return!i;for(e=toObject(e);a--;){var s=r[a];if(u&&s[2]?s[1]!==e[s[0]]:!(s[0]in e))return!1}for(;++a<i;){s=r[a];var n=s[0],o=e[n],b=s[1];if(u&&s[2]){if(void 0===o&&!(n in e))return!1}else{var f=t?t(o,b,n):void 0;if(!(void 0===f?baseIsEqual(b,o,t,!0):f))return!1}}return!0}var baseIsEqual=require("./baseIsEqual"),toObject=require("./toObject");module.exports=baseIsMatch;

},{"./baseIsEqual":83,"./toObject":127}],86:[function(require,module,exports){
function baseMap(r,a){var e=-1,i=isArrayLike(r)?Array(r.length):[];return baseEach(r,function(r,s,n){i[++e]=a(r,s,n)}),i}var baseEach=require("./baseEach"),isArrayLike=require("./isArrayLike");module.exports=baseMap;

},{"./baseEach":74,"./isArrayLike":117}],87:[function(require,module,exports){
function baseMatches(t){var e=getMatchData(t);if(1==e.length&&e[0][2]){var a=e[0][0],r=e[0][1];return function(t){return null==t?!1:(t=toObject(t),t[a]===r&&(void 0!==r||a in t))}}return function(t){return baseIsMatch(t,e)}}var baseIsMatch=require("./baseIsMatch"),getMatchData=require("./getMatchData"),toObject=require("./toObject");module.exports=baseMatches;

},{"./baseIsMatch":85,"./getMatchData":111,"./toObject":127}],88:[function(require,module,exports){
function baseMatchesProperty(e,r){var t=isArray(e),a=isKey(e)&&isStrictComparable(r),i=e+"";return e=toPath(e),function(s){if(null==s)return!1;var u=i;if(s=toObject(s),!(!t&&a||u in s)){if(s=1==e.length?s:baseGet(s,baseSlice(e,0,-1)),null==s)return!1;u=last(e),s=toObject(s)}return s[u]===r?void 0!==r||u in s:baseIsEqual(r,s[u],void 0,!0)}}var baseGet=require("./baseGet"),baseIsEqual=require("./baseIsEqual"),baseSlice=require("./baseSlice"),isArray=require("../lang/isArray"),isKey=require("./isKey"),isStrictComparable=require("./isStrictComparable"),last=require("../array/last"),toObject=require("./toObject"),toPath=require("./toPath");module.exports=baseMatchesProperty;

},{"../array/last":51,"../lang/isArray":131,"./baseGet":81,"./baseIsEqual":83,"./baseSlice":92,"./isKey":121,"./isStrictComparable":124,"./toObject":127,"./toPath":128}],89:[function(require,module,exports){
function baseProperty(e){return function(t){return null==t?void 0:toObject(t)[e]}}var toObject=require("./toObject");module.exports=baseProperty;

},{"./toObject":127}],90:[function(require,module,exports){
function basePropertyDeep(e){var t=e+"";return e=toPath(e),function(r){return baseGet(r,e,t)}}var baseGet=require("./baseGet"),toPath=require("./toPath");module.exports=basePropertyDeep;

},{"./baseGet":81,"./toPath":128}],91:[function(require,module,exports){
function baseReduce(e,u,n,c,o){return o(e,function(e,o,t){n=c?(c=!1,e):u(n,e,o,t)}),n}module.exports=baseReduce;

},{}],92:[function(require,module,exports){
function baseSlice(e,r,l){var a=-1,n=e.length;r=null==r?0:+r||0,0>r&&(r=-r>n?0:n+r),l=void 0===l||l>n?n:+l||0,0>l&&(l+=n),n=r>l?0:l-r>>>0,r>>>=0;for(var o=Array(n);++a<n;)o[a]=e[a+r];return o}module.exports=baseSlice;

},{}],93:[function(require,module,exports){
function baseToString(n){return null==n?"":n+""}module.exports=baseToString;

},{}],94:[function(require,module,exports){
function baseUniq(e,a){var r=-1,n=baseIndexOf,c=e.length,h=!0,u=h&&c>=LARGE_ARRAY_SIZE,f=u?createCache():null,s=[];f?(n=cacheIndexOf,h=!1):(u=!1,f=a?[]:s);e:for(;++r<c;){var i=e[r],t=a?a(i,r,e):i;if(h&&i===i){for(var I=f.length;I--;)if(f[I]===t)continue e;a&&f.push(t),s.push(i)}else n(f,t,0)<0&&((a||u)&&f.push(t),s.push(i))}return s}var baseIndexOf=require("./baseIndexOf"),cacheIndexOf=require("./cacheIndexOf"),createCache=require("./createCache"),LARGE_ARRAY_SIZE=200;module.exports=baseUniq;

},{"./baseIndexOf":82,"./cacheIndexOf":99,"./createCache":103}],95:[function(require,module,exports){
function binaryIndex(n,e,r){var i=0,t=n?n.length:i;if("number"==typeof e&&e===e&&HALF_MAX_ARRAY_LENGTH>=t){for(;t>i;){var A=i+t>>>1,y=n[A];(r?e>=y:e>y)&&null!==y?i=A+1:t=A}return t}return binaryIndexBy(n,e,identity,r)}var binaryIndexBy=require("./binaryIndexBy"),identity=require("../utility/identity"),MAX_ARRAY_LENGTH=4294967295,HALF_MAX_ARRAY_LENGTH=MAX_ARRAY_LENGTH>>>1;module.exports=binaryIndex;

},{"../utility/identity":150,"./binaryIndexBy":96}],96:[function(require,module,exports){
function binaryIndexBy(n,i,r,a){i=r(i);for(var e=0,l=n?n.length:0,o=i!==i,A=null===i,t=void 0===i;l>e;){var v=nativeFloor((e+l)/2),M=r(n[v]),R=void 0!==M,_=M===M;if(o)var u=_||a;else u=A?_&&R&&(a||null!=M):t?_&&(a||R):null==M?!1:a?i>=M:i>M;u?e=v+1:l=v}return nativeMin(l,MAX_ARRAY_INDEX)}var nativeFloor=Math.floor,nativeMin=Math.min,MAX_ARRAY_LENGTH=4294967295,MAX_ARRAY_INDEX=MAX_ARRAY_LENGTH-1;module.exports=binaryIndexBy;

},{}],97:[function(require,module,exports){
function bindCallback(n,t,r){if("function"!=typeof n)return identity;if(void 0===t)return n;switch(r){case 1:return function(r){return n.call(t,r)};case 3:return function(r,e,u){return n.call(t,r,e,u)};case 4:return function(r,e,u,i){return n.call(t,r,e,u,i)};case 5:return function(r,e,u,i,c){return n.call(t,r,e,u,i,c)}}return function(){return n.apply(t,arguments)}}var identity=require("../utility/identity");module.exports=bindCallback;

},{"../utility/identity":150}],98:[function(require,module,exports){
(function (global){
function bufferClone(r){var e=new ArrayBuffer(r.byteLength),n=new Uint8Array(e);return n.set(new Uint8Array(r)),e}var ArrayBuffer=global.ArrayBuffer,Uint8Array=global.Uint8Array;module.exports=bufferClone;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],99:[function(require,module,exports){
function cacheIndexOf(e,t){var a=e.data,c="string"==typeof t||isObject(t)?a.set.has(t):a.hash[t];return c?0:-1}var isObject=require("../lang/isObject");module.exports=cacheIndexOf;

},{"../lang/isObject":140}],100:[function(require,module,exports){
function cachePush(e){var s=this.data;"string"==typeof e||isObject(e)?s.set.add(e):s.hash[e]=!0}var isObject=require("../lang/isObject");module.exports=cachePush;

},{"../lang/isObject":140}],101:[function(require,module,exports){
function createBaseEach(e,t){return function(r,n){var a=r?getLength(r):0;if(!isLength(a))return e(r,n);for(var c=t?a:-1,g=toObject(r);(t?c--:++c<a)&&n(g[c],c,g)!==!1;);return r}}var getLength=require("./getLength"),isLength=require("./isLength"),toObject=require("./toObject");module.exports=createBaseEach;

},{"./getLength":110,"./isLength":122,"./toObject":127}],102:[function(require,module,exports){
function createBaseFor(e){return function(r,t,o){for(var a=toObject(r),c=o(r),n=c.length,u=e?n:-1;e?u--:++u<n;){var b=c[u];if(t(a[b],b,a)===!1)break}return r}}var toObject=require("./toObject");module.exports=createBaseFor;

},{"./toObject":127}],103:[function(require,module,exports){
(function (global){
function createCache(e){return nativeCreate&&Set?new SetCache(e):null}var SetCache=require("./SetCache"),getNative=require("./getNative"),Set=getNative(global,"Set"),nativeCreate=getNative(Object,"create");module.exports=createCache;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./SetCache":62,"./getNative":112}],104:[function(require,module,exports){
function createFind(e,r){return function(a,i,n){if(i=baseCallback(i,n,3),isArray(a)){var d=baseFindIndex(a,i,r);return d>-1?a[d]:void 0}return baseFind(a,i,e)}}var baseCallback=require("./baseCallback"),baseFind=require("./baseFind"),baseFindIndex=require("./baseFindIndex"),isArray=require("../lang/isArray");module.exports=createFind;

},{"../lang/isArray":131,"./baseCallback":70,"./baseFind":75,"./baseFindIndex":76}],105:[function(require,module,exports){
function createForEach(r,a){return function(e,i,n){return"function"==typeof i&&void 0===n&&isArray(e)?r(e,i):a(e,bindCallback(i,n,3))}}var bindCallback=require("./bindCallback"),isArray=require("../lang/isArray");module.exports=createForEach;

},{"../lang/isArray":131,"./bindCallback":97}],106:[function(require,module,exports){
function createReduce(e,r){return function(a,u,c,n){var s=arguments.length<3;return"function"==typeof u&&void 0===n&&isArray(a)?e(a,u,c,s):baseReduce(a,baseCallback(u,n,4),c,s,r)}}var baseCallback=require("./baseCallback"),baseReduce=require("./baseReduce"),isArray=require("../lang/isArray");module.exports=createReduce;

},{"../lang/isArray":131,"./baseCallback":70,"./baseReduce":91}],107:[function(require,module,exports){
function equalArrays(r,e,n,a,u,i,t){var o=-1,f=r.length,l=e.length;if(f!=l&&!(u&&l>f))return!1;for(;++o<f;){var v=r[o],y=e[o],m=a?a(u?y:v,u?v:y,o):void 0;if(void 0!==m){if(m)continue;return!1}if(u){if(!arraySome(e,function(r){return v===r||n(v,r,a,u,i,t)}))return!1}else if(v!==y&&!n(v,y,a,u,i,t))return!1}return!0}var arraySome=require("./arraySome");module.exports=equalArrays;

},{"./arraySome":68}],108:[function(require,module,exports){
function equalByTag(e,a,r){switch(r){case boolTag:case dateTag:return+e==+a;case errorTag:return e.name==a.name&&e.message==a.message;case numberTag:return e!=+e?a!=+a:e==+a;case regexpTag:case stringTag:return e==a+""}return!1}var boolTag="[object Boolean]",dateTag="[object Date]",errorTag="[object Error]",numberTag="[object Number]",regexpTag="[object RegExp]",stringTag="[object String]";module.exports=equalByTag;

},{}],109:[function(require,module,exports){
function equalObjects(r,t,o,e,n,c,s){var u=keys(r),i=u.length,a=keys(t),f=a.length;if(i!=f&&!n)return!1;for(var y=i;y--;){var v=u[y];if(!(n?v in t:hasOwnProperty.call(t,v)))return!1}for(var p=n;++y<i;){v=u[y];var l=r[v],b=t[v],j=e?e(n?b:l,n?l:b,v):void 0;if(!(void 0===j?o(l,b,e,n,c,s):j))return!1;p||(p="constructor"==v)}if(!p){var O=r.constructor,h=t.constructor;if(O!=h&&"constructor"in r&&"constructor"in t&&!("function"==typeof O&&O instanceof O&&"function"==typeof h&&h instanceof h))return!1}return!0}var keys=require("../object/keys"),objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty;module.exports=equalObjects;

},{"../object/keys":146}],110:[function(require,module,exports){
var baseProperty=require("./baseProperty"),getLength=baseProperty("length");module.exports=getLength;

},{"./baseProperty":89}],111:[function(require,module,exports){
function getMatchData(r){for(var a=pairs(r),t=a.length;t--;)a[t][2]=isStrictComparable(a[t][1]);return a}var isStrictComparable=require("./isStrictComparable"),pairs=require("../object/pairs");module.exports=getMatchData;

},{"../object/pairs":148,"./isStrictComparable":124}],112:[function(require,module,exports){
function getNative(e,i){var t=null==e?void 0:e[i];return isNative(t)?t:void 0}var isNative=require("../lang/isNative");module.exports=getNative;

},{"../lang/isNative":137}],113:[function(require,module,exports){
function indexOfNaN(r,e,n){for(var f=r.length,t=e+(n?0:-1);n?t--:++t<f;){var a=r[t];if(a!==a)return t}return-1}module.exports=indexOfNaN;

},{}],114:[function(require,module,exports){
function initCloneArray(t){var r=t.length,n=new t.constructor(r);return r&&"string"==typeof t[0]&&hasOwnProperty.call(t,"index")&&(n.index=t.index,n.input=t.input),n}var objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty;module.exports=initCloneArray;

},{}],115:[function(require,module,exports){
(function (global){
function initCloneByTag(a,t,r){var e=a.constructor;switch(t){case arrayBufferTag:return bufferClone(a);case boolTag:case dateTag:return new e(+a);case float32Tag:case float64Tag:case int8Tag:case int16Tag:case int32Tag:case uint8Tag:case uint8ClampedTag:case uint16Tag:case uint32Tag:e instanceof e&&(e=ctorByTag[t]);var g=a.buffer;return new e(r?bufferClone(g):g,a.byteOffset,a.length);case numberTag:case stringTag:return new e(a);case regexpTag:var n=new e(a.source,reFlags.exec(a));n.lastIndex=a.lastIndex}return n}var bufferClone=require("./bufferClone"),boolTag="[object Boolean]",dateTag="[object Date]",numberTag="[object Number]",regexpTag="[object RegExp]",stringTag="[object String]",arrayBufferTag="[object ArrayBuffer]",float32Tag="[object Float32Array]",float64Tag="[object Float64Array]",int8Tag="[object Int8Array]",int16Tag="[object Int16Array]",int32Tag="[object Int32Array]",uint8Tag="[object Uint8Array]",uint8ClampedTag="[object Uint8ClampedArray]",uint16Tag="[object Uint16Array]",uint32Tag="[object Uint32Array]",reFlags=/\w*$/,Uint8Array=global.Uint8Array,ctorByTag={};ctorByTag[float32Tag]=global.Float32Array,ctorByTag[float64Tag]=global.Float64Array,ctorByTag[int8Tag]=global.Int8Array,ctorByTag[int16Tag]=global.Int16Array,ctorByTag[int32Tag]=global.Int32Array,ctorByTag[uint8Tag]=Uint8Array,ctorByTag[uint8ClampedTag]=global.Uint8ClampedArray,ctorByTag[uint16Tag]=global.Uint16Array,ctorByTag[uint32Tag]=global.Uint32Array,module.exports=initCloneByTag;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./bufferClone":98}],116:[function(require,module,exports){
function initCloneObject(n){var t=n.constructor;return"function"==typeof t&&t instanceof t||(t=Object),new t}module.exports=initCloneObject;

},{}],117:[function(require,module,exports){
function isArrayLike(e){return null!=e&&isLength(getLength(e))}var getLength=require("./getLength"),isLength=require("./isLength");module.exports=isArrayLike;

},{"./getLength":110,"./isLength":122}],118:[function(require,module,exports){
var isHostObject=function(){try{Object({toString:0}+"")}catch(t){return function(){return!1}}return function(t){return"function"!=typeof t.toString&&"string"==typeof(t+"")}}();module.exports=isHostObject;

},{}],119:[function(require,module,exports){
function isIndex(e,n){return e="number"==typeof e||reIsUint.test(e)?+e:-1,n=null==n?MAX_SAFE_INTEGER:n,e>-1&&e%1==0&&n>e}var reIsUint=/^\d+$/,MAX_SAFE_INTEGER=9007199254740991;module.exports=isIndex;

},{}],120:[function(require,module,exports){
function isIterateeCall(e,r,i){if(!isObject(i))return!1;var t=typeof r;if("number"==t?isArrayLike(i)&&isIndex(r,i.length):"string"==t&&r in i){var n=i[r];return e===e?e===n:n!==n}return!1}var isArrayLike=require("./isArrayLike"),isIndex=require("./isIndex"),isObject=require("../lang/isObject");module.exports=isIterateeCall;

},{"../lang/isObject":140,"./isArrayLike":117,"./isIndex":119}],121:[function(require,module,exports){
function isKey(r,e){var t=typeof r;if("string"==t&&reIsPlainProp.test(r)||"number"==t)return!0;if(isArray(r))return!1;var i=!reIsDeepProp.test(r);return i||null!=e&&r in toObject(e)}var isArray=require("../lang/isArray"),toObject=require("./toObject"),reIsDeepProp=/\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\n\\]|\\.)*?\1)\]/,reIsPlainProp=/^\w*$/;module.exports=isKey;

},{"../lang/isArray":131,"./toObject":127}],122:[function(require,module,exports){
function isLength(e){return"number"==typeof e&&e>-1&&e%1==0&&MAX_SAFE_INTEGER>=e}var MAX_SAFE_INTEGER=9007199254740991;module.exports=isLength;

},{}],123:[function(require,module,exports){
function isObjectLike(e){return!!e&&"object"==typeof e}module.exports=isObjectLike;

},{}],124:[function(require,module,exports){
function isStrictComparable(e){return e===e&&!isObject(e)}var isObject=require("../lang/isObject");module.exports=isStrictComparable;

},{"../lang/isObject":140}],125:[function(require,module,exports){
function shimKeys(r){for(var e=keysIn(r),s=e.length,i=s&&r.length,n=!!i&&isLength(i)&&(isArray(r)||isArguments(r)||isString(r)),t=-1,o=[];++t<s;){var g=e[t];(n&&isIndex(g,i)||hasOwnProperty.call(r,g))&&o.push(g)}return o}var isArguments=require("../lang/isArguments"),isArray=require("../lang/isArray"),isIndex=require("./isIndex"),isLength=require("./isLength"),isString=require("../lang/isString"),keysIn=require("../object/keysIn"),objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty;module.exports=shimKeys;

},{"../lang/isArguments":130,"../lang/isArray":131,"../lang/isString":142,"../object/keysIn":147,"./isIndex":119,"./isLength":122}],126:[function(require,module,exports){
function sortedUniq(r,e){for(var n,o=-1,t=r.length,d=-1,i=[];++o<t;){var s=r[o],u=e?e(s,o,r):s;o&&n===u||(n=u,i[++d]=s)}return i}module.exports=sortedUniq;

},{}],127:[function(require,module,exports){
function toObject(r){if(support.unindexedChars&&isString(r)){for(var t=-1,e=r.length,i=Object(r);++t<e;)i[t]=r.charAt(t);return i}return isObject(r)?r:Object(r)}var isObject=require("../lang/isObject"),isString=require("../lang/isString"),support=require("../support");module.exports=toObject;

},{"../lang/isObject":140,"../lang/isString":142,"../support":149}],128:[function(require,module,exports){
function toPath(r){if(isArray(r))return r;var e=[];return baseToString(r).replace(rePropName,function(r,a,t,i){e.push(t?i.replace(reEscapeChar,"$1"):a||r)}),e}var baseToString=require("./baseToString"),isArray=require("../lang/isArray"),rePropName=/[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\n\\]|\\.)*?)\2)\]/g,reEscapeChar=/\\(\\)?/g;module.exports=toPath;

},{"../lang/isArray":131,"./baseToString":93}],129:[function(require,module,exports){
function cloneDeep(e,n,l){return"function"==typeof n?baseClone(e,!0,bindCallback(n,l,1)):baseClone(e,!0)}var baseClone=require("../internal/baseClone"),bindCallback=require("../internal/bindCallback");module.exports=cloneDeep;

},{"../internal/baseClone":71,"../internal/bindCallback":97}],130:[function(require,module,exports){
function isArguments(e){return isObjectLike(e)&&isArrayLike(e)&&hasOwnProperty.call(e,"callee")&&!propertyIsEnumerable.call(e,"callee")}var isArrayLike=require("../internal/isArrayLike"),isObjectLike=require("../internal/isObjectLike"),objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty,propertyIsEnumerable=objectProto.propertyIsEnumerable;module.exports=isArguments;

},{"../internal/isArrayLike":117,"../internal/isObjectLike":123}],131:[function(require,module,exports){
var getNative=require("../internal/getNative"),isLength=require("../internal/isLength"),isObjectLike=require("../internal/isObjectLike"),arrayTag="[object Array]",objectProto=Object.prototype,objToString=objectProto.toString,nativeIsArray=getNative(Array,"isArray"),isArray=nativeIsArray||function(r){return isObjectLike(r)&&isLength(r.length)&&objToString.call(r)==arrayTag};module.exports=isArray;

},{"../internal/getNative":112,"../internal/isLength":122,"../internal/isObjectLike":123}],132:[function(require,module,exports){
function isBoolean(o){return o===!0||o===!1||isObjectLike(o)&&objToString.call(o)==boolTag}var isObjectLike=require("../internal/isObjectLike"),boolTag="[object Boolean]",objectProto=Object.prototype,objToString=objectProto.toString;module.exports=isBoolean;

},{"../internal/isObjectLike":123}],133:[function(require,module,exports){
function isDate(t){return isObjectLike(t)&&objToString.call(t)==dateTag}var isObjectLike=require("../internal/isObjectLike"),dateTag="[object Date]",objectProto=Object.prototype,objToString=objectProto.toString;module.exports=isDate;

},{"../internal/isObjectLike":123}],134:[function(require,module,exports){
function isError(r){return isObjectLike(r)&&"string"==typeof r.message&&objToString.call(r)==errorTag}var isObjectLike=require("../internal/isObjectLike"),errorTag="[object Error]",objectProto=Object.prototype,objToString=objectProto.toString;module.exports=isError;

},{"../internal/isObjectLike":123}],135:[function(require,module,exports){
(function (global){
function isFinite(i){return"number"==typeof i&&nativeIsFinite(i)}var nativeIsFinite=global.isFinite;module.exports=isFinite;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],136:[function(require,module,exports){
function isFunction(t){return isObject(t)&&objToString.call(t)==funcTag}var isObject=require("./isObject"),funcTag="[object Function]",objectProto=Object.prototype,objToString=objectProto.toString;module.exports=isFunction;

},{"./isObject":140}],137:[function(require,module,exports){
function isNative(t){return null==t?!1:isFunction(t)?reIsNative.test(fnToString.call(t)):isObjectLike(t)&&(isHostObject(t)?reIsNative:reIsHostCtor).test(t)}var isFunction=require("./isFunction"),isHostObject=require("../internal/isHostObject"),isObjectLike=require("../internal/isObjectLike"),reIsHostCtor=/^\[object .+?Constructor\]$/,objectProto=Object.prototype,fnToString=Function.prototype.toString,hasOwnProperty=objectProto.hasOwnProperty,reIsNative=RegExp("^"+fnToString.call(hasOwnProperty).replace(/[\\^$.*+?()[\]{}|]/g,"\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g,"$1.*?")+"$");module.exports=isNative;

},{"../internal/isHostObject":118,"../internal/isObjectLike":123,"./isFunction":136}],138:[function(require,module,exports){
function isNull(l){return null===l}module.exports=isNull;

},{}],139:[function(require,module,exports){
function isNumber(e){return"number"==typeof e||isObjectLike(e)&&objToString.call(e)==numberTag}var isObjectLike=require("../internal/isObjectLike"),numberTag="[object Number]",objectProto=Object.prototype,objToString=objectProto.toString;module.exports=isNumber;

},{"../internal/isObjectLike":123}],140:[function(require,module,exports){
function isObject(t){var e=typeof t;return!!t&&("object"==e||"function"==e)}module.exports=isObject;

},{}],141:[function(require,module,exports){
function isPlainObject(t){var r;if(!isObjectLike(t)||objToString.call(t)!=objectTag||isHostObject(t)||isArguments(t)||!hasOwnProperty.call(t,"constructor")&&(r=t.constructor,"function"==typeof r&&!(r instanceof r)))return!1;var e;return support.ownLast?(baseForIn(t,function(t,r,o){return e=hasOwnProperty.call(o,r),!1}),e!==!1):(baseForIn(t,function(t,r){e=r}),void 0===e||hasOwnProperty.call(t,e))}var baseForIn=require("../internal/baseForIn"),isArguments=require("./isArguments"),isHostObject=require("../internal/isHostObject"),isObjectLike=require("../internal/isObjectLike"),support=require("../support"),objectTag="[object Object]",objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty,objToString=objectProto.toString;module.exports=isPlainObject;

},{"../internal/baseForIn":79,"../internal/isHostObject":118,"../internal/isObjectLike":123,"../support":149,"./isArguments":130}],142:[function(require,module,exports){
function isString(t){return"string"==typeof t||isObjectLike(t)&&objToString.call(t)==stringTag}var isObjectLike=require("../internal/isObjectLike"),stringTag="[object String]",objectProto=Object.prototype,objToString=objectProto.toString;module.exports=isString;

},{"../internal/isObjectLike":123}],143:[function(require,module,exports){
function isTypedArray(a){return isObjectLike(a)&&isLength(a.length)&&!!typedArrayTags[objToString.call(a)]}var isLength=require("../internal/isLength"),isObjectLike=require("../internal/isObjectLike"),argsTag="[object Arguments]",arrayTag="[object Array]",boolTag="[object Boolean]",dateTag="[object Date]",errorTag="[object Error]",funcTag="[object Function]",mapTag="[object Map]",numberTag="[object Number]",objectTag="[object Object]",regexpTag="[object RegExp]",setTag="[object Set]",stringTag="[object String]",weakMapTag="[object WeakMap]",arrayBufferTag="[object ArrayBuffer]",float32Tag="[object Float32Array]",float64Tag="[object Float64Array]",int8Tag="[object Int8Array]",int16Tag="[object Int16Array]",int32Tag="[object Int32Array]",uint8Tag="[object Uint8Array]",uint8ClampedTag="[object Uint8ClampedArray]",uint16Tag="[object Uint16Array]",uint32Tag="[object Uint32Array]",typedArrayTags={};typedArrayTags[float32Tag]=typedArrayTags[float64Tag]=typedArrayTags[int8Tag]=typedArrayTags[int16Tag]=typedArrayTags[int32Tag]=typedArrayTags[uint8Tag]=typedArrayTags[uint8ClampedTag]=typedArrayTags[uint16Tag]=typedArrayTags[uint32Tag]=!0,typedArrayTags[argsTag]=typedArrayTags[arrayTag]=typedArrayTags[arrayBufferTag]=typedArrayTags[boolTag]=typedArrayTags[dateTag]=typedArrayTags[errorTag]=typedArrayTags[funcTag]=typedArrayTags[mapTag]=typedArrayTags[numberTag]=typedArrayTags[objectTag]=typedArrayTags[regexpTag]=typedArrayTags[setTag]=typedArrayTags[stringTag]=typedArrayTags[weakMapTag]=!1;var objectProto=Object.prototype,objToString=objectProto.toString;module.exports=isTypedArray;

},{"../internal/isLength":122,"../internal/isObjectLike":123}],144:[function(require,module,exports){
function isUndefined(e){return void 0===e}module.exports=isUndefined;

},{}],145:[function(require,module,exports){
function has(e,r){if(null==e)return!1;var t=hasOwnProperty.call(e,r);if(!t&&!isKey(r)){if(r=toPath(r),e=1==r.length?e:baseGet(e,baseSlice(r,0,-1)),null==e)return!1;r=last(r),t=hasOwnProperty.call(e,r)}return t||isLength(e.length)&&isIndex(r,e.length)&&(isArray(e)||isArguments(e)||isString(e))}var baseGet=require("../internal/baseGet"),baseSlice=require("../internal/baseSlice"),isArguments=require("../lang/isArguments"),isArray=require("../lang/isArray"),isIndex=require("../internal/isIndex"),isKey=require("../internal/isKey"),isLength=require("../internal/isLength"),isString=require("../lang/isString"),last=require("../array/last"),toPath=require("../internal/toPath"),objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty;module.exports=has;

},{"../array/last":51,"../internal/baseGet":81,"../internal/baseSlice":92,"../internal/isIndex":119,"../internal/isKey":121,"../internal/isLength":122,"../internal/toPath":128,"../lang/isArguments":130,"../lang/isArray":131,"../lang/isString":142}],146:[function(require,module,exports){
var getNative=require("../internal/getNative"),isArrayLike=require("../internal/isArrayLike"),isObject=require("../lang/isObject"),shimKeys=require("../internal/shimKeys"),support=require("../support"),nativeKeys=getNative(Object,"keys"),keys=nativeKeys?function(e){var t=null==e?void 0:e.constructor;return"function"==typeof t&&t.prototype===e||("function"==typeof e?support.enumPrototypes:isArrayLike(e))?shimKeys(e):isObject(e)?nativeKeys(e):[]}:shimKeys;module.exports=keys;

},{"../internal/getNative":112,"../internal/isArrayLike":117,"../internal/shimKeys":125,"../lang/isObject":140,"../support":149}],147:[function(require,module,exports){
function keysIn(r){if(null==r)return[];isObject(r)||(r=Object(r));var o=r.length;o=o&&isLength(o)&&(isArray(r)||isArguments(r)||isString(r))&&o||0;for(var n=r.constructor,t=-1,e=isFunction(n)&&n.prototype||objectProto,a=e===r,s=Array(o),i=o>0,u=support.enumErrorProps&&(r===errorProto||r instanceof Error),c=support.enumPrototypes&&isFunction(r);++t<o;)s[t]=t+"";for(var g in r)c&&"prototype"==g||u&&("message"==g||"name"==g)||i&&isIndex(g,o)||"constructor"==g&&(a||!hasOwnProperty.call(r,g))||s.push(g);if(support.nonEnumShadows&&r!==objectProto){var p=r===stringProto?stringTag:r===errorProto?errorTag:objToString.call(r),P=nonEnumProps[p]||nonEnumProps[objectTag];for(p==objectTag&&(e=objectProto),o=shadowProps.length;o--;){g=shadowProps[o];var b=P[g];a&&b||(b?!hasOwnProperty.call(r,g):r[g]===e[g])||s.push(g)}}return s}var arrayEach=require("../internal/arrayEach"),isArguments=require("../lang/isArguments"),isArray=require("../lang/isArray"),isFunction=require("../lang/isFunction"),isIndex=require("../internal/isIndex"),isLength=require("../internal/isLength"),isObject=require("../lang/isObject"),isString=require("../lang/isString"),support=require("../support"),arrayTag="[object Array]",boolTag="[object Boolean]",dateTag="[object Date]",errorTag="[object Error]",funcTag="[object Function]",numberTag="[object Number]",objectTag="[object Object]",regexpTag="[object RegExp]",stringTag="[object String]",shadowProps=["constructor","hasOwnProperty","isPrototypeOf","propertyIsEnumerable","toLocaleString","toString","valueOf"],errorProto=Error.prototype,objectProto=Object.prototype,stringProto=String.prototype,hasOwnProperty=objectProto.hasOwnProperty,objToString=objectProto.toString,nonEnumProps={};nonEnumProps[arrayTag]=nonEnumProps[dateTag]=nonEnumProps[numberTag]={constructor:!0,toLocaleString:!0,toString:!0,valueOf:!0},nonEnumProps[boolTag]=nonEnumProps[stringTag]={constructor:!0,toString:!0,valueOf:!0},nonEnumProps[errorTag]=nonEnumProps[funcTag]=nonEnumProps[regexpTag]={constructor:!0,toString:!0},nonEnumProps[objectTag]={constructor:!0},arrayEach(shadowProps,function(r){for(var o in nonEnumProps)if(hasOwnProperty.call(nonEnumProps,o)){var n=nonEnumProps[o];n[r]=hasOwnProperty.call(n,r)}}),module.exports=keysIn;

},{"../internal/arrayEach":64,"../internal/isIndex":119,"../internal/isLength":122,"../lang/isArguments":130,"../lang/isArray":131,"../lang/isFunction":136,"../lang/isObject":140,"../lang/isString":142,"../support":149}],148:[function(require,module,exports){
function pairs(r){r=toObject(r);for(var e=-1,t=keys(r),a=t.length,o=Array(a);++e<a;){var i=t[e];o[e]=[i,r[i]]}return o}var keys=require("./keys"),toObject=require("../internal/toObject");module.exports=pairs;

},{"../internal/toObject":127,"./keys":146}],149:[function(require,module,exports){
var arrayProto=Array.prototype,errorProto=Error.prototype,objectProto=Object.prototype,propertyIsEnumerable=objectProto.propertyIsEnumerable,splice=arrayProto.splice,support={};!function(r){var o=function(){this.x=r},e={0:r,length:r},t=[];o.prototype={valueOf:r,y:r};for(var p in new o)t.push(p);support.enumErrorProps=propertyIsEnumerable.call(errorProto,"message")||propertyIsEnumerable.call(errorProto,"name"),support.enumPrototypes=propertyIsEnumerable.call(o,"prototype"),support.nonEnumShadows=!/valueOf/.test(t),support.ownLast="x"!=t[0],support.spliceObjects=(splice.call(e,0,1),!e[0]),support.unindexedChars="x"[0]+Object("x")[0]!="xx"}(1,0),module.exports=support;

},{}],150:[function(require,module,exports){
function identity(t){return t}module.exports=identity;

},{}],151:[function(require,module,exports){
function property(e){return isKey(e)?baseProperty(e):basePropertyDeep(e)}var baseProperty=require("../internal/baseProperty"),basePropertyDeep=require("../internal/basePropertyDeep"),isKey=require("../internal/isKey");module.exports=property;

},{"../internal/baseProperty":89,"../internal/basePropertyDeep":90,"../internal/isKey":121}],152:[function(require,module,exports){
(function (global){
function times(i,n,a){if(i=nativeFloor(i),1>i||!nativeIsFinite(i))return[];var e=-1,t=Array(nativeMin(i,MAX_ARRAY_LENGTH));for(n=bindCallback(n,a,1);++e<i;)MAX_ARRAY_LENGTH>e?t[e]=n(e):n(e);return t}var bindCallback=require("../internal/bindCallback"),nativeFloor=Math.floor,nativeIsFinite=global.isFinite,nativeMin=Math.min,MAX_ARRAY_LENGTH=4294967295;module.exports=times;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../internal/bindCallback":97}],153:[function(require,module,exports){
!function(t){if("object"==typeof exports)module.exports=t();else if("function"==typeof define&&define.amd)define(t);else{var r;try{r=window}catch(n){r=self}r.SparkMD5=t()}}(function(t){"use strict";function r(t,r,n,e,f,h){return r=d(d(r,t),d(e,h)),d(r<<f|r>>>32-f,n)}function n(t,n,e,f,h,i,o){return r(n&e|~n&f,t,n,h,i,o)}function e(t,n,e,f,h,i,o){return r(n&f|e&~f,t,n,h,i,o)}function f(t,n,e,f,h,i,o){return r(n^e^f,t,n,h,i,o)}function h(t,n,e,f,h,i,o){return r(e^(n|~f),t,n,h,i,o)}function i(t,r){var i=t[0],o=t[1],u=t[2],s=t[3];i=n(i,o,u,s,r[0],7,-680876936),s=n(s,i,o,u,r[1],12,-389564586),u=n(u,s,i,o,r[2],17,606105819),o=n(o,u,s,i,r[3],22,-1044525330),i=n(i,o,u,s,r[4],7,-176418897),s=n(s,i,o,u,r[5],12,1200080426),u=n(u,s,i,o,r[6],17,-1473231341),o=n(o,u,s,i,r[7],22,-45705983),i=n(i,o,u,s,r[8],7,1770035416),s=n(s,i,o,u,r[9],12,-1958414417),u=n(u,s,i,o,r[10],17,-42063),o=n(o,u,s,i,r[11],22,-1990404162),i=n(i,o,u,s,r[12],7,1804603682),s=n(s,i,o,u,r[13],12,-40341101),u=n(u,s,i,o,r[14],17,-1502002290),o=n(o,u,s,i,r[15],22,1236535329),i=e(i,o,u,s,r[1],5,-165796510),s=e(s,i,o,u,r[6],9,-1069501632),u=e(u,s,i,o,r[11],14,643717713),o=e(o,u,s,i,r[0],20,-373897302),i=e(i,o,u,s,r[5],5,-701558691),s=e(s,i,o,u,r[10],9,38016083),u=e(u,s,i,o,r[15],14,-660478335),o=e(o,u,s,i,r[4],20,-405537848),i=e(i,o,u,s,r[9],5,568446438),s=e(s,i,o,u,r[14],9,-1019803690),u=e(u,s,i,o,r[3],14,-187363961),o=e(o,u,s,i,r[8],20,1163531501),i=e(i,o,u,s,r[13],5,-1444681467),s=e(s,i,o,u,r[2],9,-51403784),u=e(u,s,i,o,r[7],14,1735328473),o=e(o,u,s,i,r[12],20,-1926607734),i=f(i,o,u,s,r[5],4,-378558),s=f(s,i,o,u,r[8],11,-2022574463),u=f(u,s,i,o,r[11],16,1839030562),o=f(o,u,s,i,r[14],23,-35309556),i=f(i,o,u,s,r[1],4,-1530992060),s=f(s,i,o,u,r[4],11,1272893353),u=f(u,s,i,o,r[7],16,-155497632),o=f(o,u,s,i,r[10],23,-1094730640),i=f(i,o,u,s,r[13],4,681279174),s=f(s,i,o,u,r[0],11,-358537222),u=f(u,s,i,o,r[3],16,-722521979),o=f(o,u,s,i,r[6],23,76029189),i=f(i,o,u,s,r[9],4,-640364487),s=f(s,i,o,u,r[12],11,-421815835),u=f(u,s,i,o,r[15],16,530742520),o=f(o,u,s,i,r[2],23,-995338651),i=h(i,o,u,s,r[0],6,-198630844),s=h(s,i,o,u,r[7],10,1126891415),u=h(u,s,i,o,r[14],15,-1416354905),o=h(o,u,s,i,r[5],21,-57434055),i=h(i,o,u,s,r[12],6,1700485571),s=h(s,i,o,u,r[3],10,-1894986606),u=h(u,s,i,o,r[10],15,-1051523),o=h(o,u,s,i,r[1],21,-2054922799),i=h(i,o,u,s,r[8],6,1873313359),s=h(s,i,o,u,r[15],10,-30611744),u=h(u,s,i,o,r[6],15,-1560198380),o=h(o,u,s,i,r[13],21,1309151649),i=h(i,o,u,s,r[4],6,-145523070),s=h(s,i,o,u,r[11],10,-1120210379),u=h(u,s,i,o,r[2],15,718787259),o=h(o,u,s,i,r[9],21,-343485551),t[0]=d(i,t[0]),t[1]=d(o,t[1]),t[2]=d(u,t[2]),t[3]=d(s,t[3])}function o(t){var r,n=[];for(r=0;64>r;r+=4)n[r>>2]=t.charCodeAt(r)+(t.charCodeAt(r+1)<<8)+(t.charCodeAt(r+2)<<16)+(t.charCodeAt(r+3)<<24);return n}function u(t){var r,n=[];for(r=0;64>r;r+=4)n[r>>2]=t[r]+(t[r+1]<<8)+(t[r+2]<<16)+(t[r+3]<<24);return n}function s(t){var r,n,e,f,h,u,s=t.length,a=[1732584193,-271733879,-1732584194,271733878];for(r=64;s>=r;r+=64)i(a,o(t.substring(r-64,r)));for(t=t.substring(r-64),n=t.length,e=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],r=0;n>r;r+=1)e[r>>2]|=t.charCodeAt(r)<<(r%4<<3);if(e[r>>2]|=128<<(r%4<<3),r>55)for(i(a,e),r=0;16>r;r+=1)e[r]=0;return f=8*s,f=f.toString(16).match(/(.*?)(.{0,8})$/),h=parseInt(f[2],16),u=parseInt(f[1],16)||0,e[14]=h,e[15]=u,i(a,e),a}function a(t){var r,n,e,f,h,o,s=t.length,a=[1732584193,-271733879,-1732584194,271733878];for(r=64;s>=r;r+=64)i(a,u(t.subarray(r-64,r)));for(t=s>r-64?t.subarray(r-64):new Uint8Array(0),n=t.length,e=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],r=0;n>r;r+=1)e[r>>2]|=t[r]<<(r%4<<3);if(e[r>>2]|=128<<(r%4<<3),r>55)for(i(a,e),r=0;16>r;r+=1)e[r]=0;return f=8*s,f=f.toString(16).match(/(.*?)(.{0,8})$/),h=parseInt(f[2],16),o=parseInt(f[1],16)||0,e[14]=h,e[15]=o,i(a,e),a}function p(t){var r,n="";for(r=0;4>r;r+=1)n+=A[t>>8*r+4&15]+A[t>>8*r&15];return n}function c(t){var r;for(r=0;r<t.length;r+=1)t[r]=p(t[r]);return t.join("")}function y(t){return/[\u0080-\uFFFF]/.test(t)&&(t=unescape(encodeURIComponent(t))),t}function _(t,r){var n,e=t.length,f=new ArrayBuffer(e),h=new Uint8Array(f);for(n=0;e>n;n++)h[n]=t.charCodeAt(n);return r?h:f}function b(t){return String.fromCharCode.apply(null,new Uint8Array(t))}function l(t,r,n){var e=new Uint8Array(t.byteLength+r.byteLength);return e.set(new Uint8Array(t)),e.set(new Uint8Array(r),t.byteLength),n?e:e.buffer}function g(){this.reset()}var d=function(t,r){return t+r&4294967295},A=["0","1","2","3","4","5","6","7","8","9","a","b","c","d","e","f"];return"5d41402abc4b2a76b9719d911017c592"!==c(s("hello"))&&(d=function(t,r){var n=(65535&t)+(65535&r),e=(t>>16)+(r>>16)+(n>>16);return e<<16|65535&n}),g.prototype.append=function(t){return this.appendBinary(y(t)),this},g.prototype.appendBinary=function(t){this._buff+=t,this._length+=t.length;var r,n=this._buff.length;for(r=64;n>=r;r+=64)i(this._hash,o(this._buff.substring(r-64,r)));return this._buff=this._buff.substring(r-64),this},g.prototype.end=function(t){var r,n,e=this._buff,f=e.length,h=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];for(r=0;f>r;r+=1)h[r>>2]|=e.charCodeAt(r)<<(r%4<<3);return this._finish(h,f),n=t?this._hash:c(this._hash),this.reset(),n},g.prototype.reset=function(){return this._buff="",this._length=0,this._hash=[1732584193,-271733879,-1732584194,271733878],this},g.prototype.getState=function(){return{buff:this._buff,length:this._length,hash:this._hash}},g.prototype.setState=function(t){return this._buff=t.buff,this._length=t.length,this._hash=t.hash,this},g.prototype.destroy=function(){delete this._hash,delete this._buff,delete this._length},g.prototype._finish=function(t,r){var n,e,f,h=r;if(t[h>>2]|=128<<(h%4<<3),h>55)for(i(this._hash,t),h=0;16>h;h+=1)t[h]=0;n=8*this._length,n=n.toString(16).match(/(.*?)(.{0,8})$/),e=parseInt(n[2],16),f=parseInt(n[1],16)||0,t[14]=e,t[15]=f,i(this._hash,t)},g.hash=function(t,r){return g.hashBinary(y(t),r)},g.hashBinary=function(t,r){var n=s(t);return r?n:c(n)},g.ArrayBuffer=function(){this.reset()},g.ArrayBuffer.prototype.append=function(t){var r,n=l(this._buff.buffer,t,!0),e=n.length;for(this._length+=t.byteLength,r=64;e>=r;r+=64)i(this._hash,u(n.subarray(r-64,r)));return this._buff=e>r-64?n.subarray(r-64):new Uint8Array(0),this},g.ArrayBuffer.prototype.end=function(t){var r,n,e=this._buff,f=e.length,h=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];for(r=0;f>r;r+=1)h[r>>2]|=e[r]<<(r%4<<3);return this._finish(h,f),n=t?this._hash:c(this._hash),this.reset(),n},g.ArrayBuffer.prototype.reset=function(){return this._buff=new Uint8Array(0),this._length=0,this._hash=[1732584193,-271733879,-1732584194,271733878],this},g.ArrayBuffer.prototype.getState=function(){var t=g.prototype.getState.call(this);return t.buff=b(t.buff),t},g.ArrayBuffer.prototype.setState=function(t){return t.buff=_(t.buff,!0),g.prototype.setState.call(this,t)},g.ArrayBuffer.prototype.destroy=g.prototype.destroy,g.ArrayBuffer.prototype._finish=g.prototype._finish,g.ArrayBuffer.hash=function(t,r){var n=a(new Uint8Array(t));return r?n:c(n)},g});

},{}],154:[function(require,module,exports){
function noop(){}function isHost(t){var e={}.toString.call(t);switch(e){case"[object File]":case"[object Blob]":case"[object FormData]":return!0;default:return!1}}function isObject(t){return t===Object(t)}function serialize(t){if(!isObject(t))return t;var e=[];for(var r in t)null!=t[r]&&e.push(encodeURIComponent(r)+"="+encodeURIComponent(t[r]));return e.join("&")}function parseString(t){for(var e,r,s={},i=t.split("&"),o=0,n=i.length;n>o;++o)r=i[o],e=r.split("="),s[decodeURIComponent(e[0])]=decodeURIComponent(e[1]);return s}function parseHeader(t){var e,r,s,i,o=t.split(/\r?\n/),n={};o.pop();for(var a=0,u=o.length;u>a;++a)r=o[a],e=r.indexOf(":"),s=r.slice(0,e).toLowerCase(),i=trim(r.slice(e+1)),n[s]=i;return n}function type(t){return t.split(/ *; */).shift()}function params(t){return reduce(t.split(/ *; */),function(t,e){var r=e.split(/ *= */),s=r.shift(),i=r.shift();return s&&i&&(t[s]=i),t},{})}function Response(t,e){e=e||{},this.req=t,this.xhr=this.req.xhr,this.text="HEAD"!=this.req.method&&(""===this.xhr.responseType||"text"===this.xhr.responseType)||"undefined"==typeof this.xhr.responseType?this.xhr.responseText:null,this.statusText=this.req.xhr.statusText,this.setStatusProperties(this.xhr.status),this.header=this.headers=parseHeader(this.xhr.getAllResponseHeaders()),this.header["content-type"]=this.xhr.getResponseHeader("content-type"),this.setHeaderProperties(this.header),this.body="HEAD"!=this.req.method?this.parseBody(this.text?this.text:this.xhr.response):null}function Request(t,e){var r=this;Emitter.call(this),this._query=this._query||[],this.method=t,this.url=e,this.header={},this._header={},this.on("end",function(){var t=null,e=null;try{e=new Response(r)}catch(s){return t=new Error("Parser is unable to parse the response"),t.parse=!0,t.original=s,r.callback(t)}if(r.emit("response",e),t)return r.callback(t,e);if(e.status>=200&&e.status<300)return r.callback(t,e);var i=new Error(e.statusText||"Unsuccessful HTTP response");i.original=t,i.response=e,i.status=e.status,r.callback(t||i,e)})}function request(t,e){return"function"==typeof e?new Request("GET",t).end(e):1==arguments.length?new Request("GET",t):new Request(t,e)}var Emitter=require("emitter"),reduce=require("reduce"),root="undefined"==typeof window?this||self:window;request.getXHR=function(){if(!(!root.XMLHttpRequest||root.location&&"file:"==root.location.protocol&&root.ActiveXObject))return new XMLHttpRequest;try{return new ActiveXObject("Microsoft.XMLHTTP")}catch(t){}try{return new ActiveXObject("Msxml2.XMLHTTP.6.0")}catch(t){}try{return new ActiveXObject("Msxml2.XMLHTTP.3.0")}catch(t){}try{return new ActiveXObject("Msxml2.XMLHTTP")}catch(t){}return!1};var trim="".trim?function(t){return t.trim()}:function(t){return t.replace(/(^\s*|\s*$)/g,"")};request.serializeObject=serialize,request.parseString=parseString,request.types={html:"text/html",json:"application/json",xml:"application/xml",urlencoded:"application/x-www-form-urlencoded",form:"application/x-www-form-urlencoded","form-data":"application/x-www-form-urlencoded"},request.serialize={"application/x-www-form-urlencoded":serialize,"application/json":JSON.stringify},request.parse={"application/x-www-form-urlencoded":parseString,"application/json":JSON.parse},Response.prototype.get=function(t){return this.header[t.toLowerCase()]},Response.prototype.setHeaderProperties=function(t){var e=this.header["content-type"]||"";this.type=type(e);var r=params(e);for(var s in r)this[s]=r[s]},Response.prototype.parseBody=function(t){var e=request.parse[this.type];return e&&t&&(t.length||t instanceof Object)?e(t):null},Response.prototype.setStatusProperties=function(t){1223===t&&(t=204);var e=t/100|0;this.status=t,this.statusType=e,this.info=1==e,this.ok=2==e,this.clientError=4==e,this.serverError=5==e,this.error=4==e||5==e?this.toError():!1,this.accepted=202==t,this.noContent=204==t,this.badRequest=400==t,this.unauthorized=401==t,this.notAcceptable=406==t,this.notFound=404==t,this.forbidden=403==t},Response.prototype.toError=function(){var t=this.req,e=t.method,r=t.url,s="cannot "+e+" "+r+" ("+this.status+")",i=new Error(s);return i.status=this.status,i.method=e,i.url=r,i},request.Response=Response,Emitter(Request.prototype),Request.prototype.use=function(t){return t(this),this},Request.prototype.timeout=function(t){return this._timeout=t,this},Request.prototype.clearTimeout=function(){return this._timeout=0,clearTimeout(this._timer),this},Request.prototype.abort=function(){return this.aborted?void 0:(this.aborted=!0,this.xhr.abort(),this.clearTimeout(),this.emit("abort"),this)},Request.prototype.set=function(t,e){if(isObject(t)){for(var r in t)this.set(r,t[r]);return this}return this._header[t.toLowerCase()]=e,this.header[t]=e,this},Request.prototype.unset=function(t){return delete this._header[t.toLowerCase()],delete this.header[t],this},Request.prototype.getHeader=function(t){return this._header[t.toLowerCase()]},Request.prototype.type=function(t){return this.set("Content-Type",request.types[t]||t),this},Request.prototype.accept=function(t){return this.set("Accept",request.types[t]||t),this},Request.prototype.auth=function(t,e){var r=btoa(t+":"+e);return this.set("Authorization","Basic "+r),this},Request.prototype.query=function(t){return"string"!=typeof t&&(t=serialize(t)),t&&this._query.push(t),this},Request.prototype.field=function(t,e){return this._formData||(this._formData=new root.FormData),this._formData.append(t,e),this},Request.prototype.attach=function(t,e,r){return this._formData||(this._formData=new root.FormData),this._formData.append(t,e,r),this},Request.prototype.send=function(t){var e=isObject(t),r=this.getHeader("Content-Type");if(e&&isObject(this._data))for(var s in t)this._data[s]=t[s];else"string"==typeof t?(r||this.type("form"),r=this.getHeader("Content-Type"),"application/x-www-form-urlencoded"==r?this._data=this._data?this._data+"&"+t:t:this._data=(this._data||"")+t):this._data=t;return!e||isHost(t)?this:(r||this.type("json"),this)},Request.prototype.callback=function(t,e){var r=this._callback;this.clearTimeout(),r(t,e)},Request.prototype.crossDomainError=function(){var t=new Error("Origin is not allowed by Access-Control-Allow-Origin");t.crossDomain=!0,this.callback(t)},Request.prototype.timeoutError=function(){var t=this._timeout,e=new Error("timeout of "+t+"ms exceeded");e.timeout=t,this.callback(e)},Request.prototype.withCredentials=function(){return this._withCredentials=!0,this},Request.prototype.end=function(t){var e=this,r=this.xhr=request.getXHR(),s=this._query.join("&"),i=this._timeout,o=this._formData||this._data;this._callback=t||noop,r.onreadystatechange=function(){if(4==r.readyState){var t;try{t=r.status}catch(s){t=0}if(0==t){if(e.timedout)return e.timeoutError();if(e.aborted)return;return e.crossDomainError()}e.emit("end")}};var n=function(t){t.total>0&&(t.percent=t.loaded/t.total*100),e.emit("progress",t)};this.hasListeners("progress")&&(r.onprogress=n);try{r.upload&&this.hasListeners("progress")&&(r.upload.onprogress=n)}catch(a){}if(i&&!this._timer&&(this._timer=setTimeout(function(){e.timedout=!0,e.abort()},i)),s&&(s=request.serializeObject(s),this.url+=~this.url.indexOf("?")?"&"+s:"?"+s),r.open(this.method,this.url,!0),this._withCredentials&&(r.withCredentials=!0),"GET"!=this.method&&"HEAD"!=this.method&&"string"!=typeof o&&!isHost(o)){var u=request.serialize[this.getHeader("Content-Type")];u&&(o=u(o))}for(var h in this.header)null!=this.header[h]&&r.setRequestHeader(h,this.header[h]);return this.emit("request",this),r.send(o),this},request.Request=Request,request.get=function(t,e,r){var s=request("GET",t);return"function"==typeof e&&(r=e,e=null),e&&s.query(e),r&&s.end(r),s},request.head=function(t,e,r){var s=request("HEAD",t);return"function"==typeof e&&(r=e,e=null),e&&s.send(e),r&&s.end(r),s},request.del=function(t,e){var r=request("DELETE",t);return e&&r.end(e),r},request.patch=function(t,e,r){var s=request("PATCH",t);return"function"==typeof e&&(r=e,e=null),e&&s.send(e),r&&s.end(r),s},request.post=function(t,e,r){var s=request("POST",t);return"function"==typeof e&&(r=e,e=null),e&&s.send(e),r&&s.end(r),s},request.put=function(t,e,r){var s=request("PUT",t);return"function"==typeof e&&(r=e,e=null),e&&s.send(e),r&&s.end(r),s},module.exports=request;

},{"emitter":155,"reduce":156}],155:[function(require,module,exports){
function Emitter(t){return t?mixin(t):void 0}function mixin(t){for(var e in Emitter.prototype)t[e]=Emitter.prototype[e];return t}module.exports=Emitter,Emitter.prototype.on=Emitter.prototype.addEventListener=function(t,e){return this._callbacks=this._callbacks||{},(this._callbacks[t]=this._callbacks[t]||[]).push(e),this},Emitter.prototype.once=function(t,e){function i(){r.off(t,i),e.apply(this,arguments)}var r=this;return this._callbacks=this._callbacks||{},i.fn=e,this.on(t,i),this},Emitter.prototype.off=Emitter.prototype.removeListener=Emitter.prototype.removeAllListeners=Emitter.prototype.removeEventListener=function(t,e){if(this._callbacks=this._callbacks||{},0==arguments.length)return this._callbacks={},this;var i=this._callbacks[t];if(!i)return this;if(1==arguments.length)return delete this._callbacks[t],this;for(var r,s=0;s<i.length;s++)if(r=i[s],r===e||r.fn===e){i.splice(s,1);break}return this},Emitter.prototype.emit=function(t){this._callbacks=this._callbacks||{};var e=[].slice.call(arguments,1),i=this._callbacks[t];if(i){i=i.slice(0);for(var r=0,s=i.length;s>r;++r)i[r].apply(this,e)}return this},Emitter.prototype.listeners=function(t){return this._callbacks=this._callbacks||{},this._callbacks[t]||[]},Emitter.prototype.hasListeners=function(t){return!!this.listeners(t).length};

},{}],156:[function(require,module,exports){
module.exports=function(l,n,e){for(var r=0,t=l.length,u=3==arguments.length?e:l[r++];t>r;)u=n.call(null,u,l[r],++r,l);return u};

},{}],157:[function(require,module,exports){
function convert(e,t){if("object"!=typeof e)throw new Error("resourceListing must be an object");Array.isArray(t)||(t=[]);var r={},i={},n={swagger:"2.0",info:buildInfo(e),paths:{}};return e.authorizations&&(n.securityDefinitions=buildSecurityDefinitions(e,r)),e.basePath&&assignPathComponents(e.basePath,n),extend(i,e.models),Array.isArray(e.apis)&&(t.length>0&&(n.tags=[]),e.apis.forEach(function(t){n.tags&&n.tags.push({name:t.path.replace(".{format}","").substring(1),description:t.description}),Array.isArray(t.operations)&&(n.paths[t.path]=buildPath(t,e))})),t.forEach(function(e){e.basePath&&assignPathComponents(e.basePath,n),Array.isArray(e.apis)&&(e.apis.forEach(function(t){n.paths[t.path]=buildPath(t,e)}),e.models&&Object.keys(e.models).length&&extend(i,transformAllModels(e.models)))}),Object.keys(i).length&&(n.definitions=transformAllModels(i)),n}function buildInfo(e){var t={version:e.apiVersion,title:"Title was not specified"};return"object"==typeof e.info&&(e.info.title&&(t.title=e.info.title),e.info.description&&(t.description=e.info.description),e.info.contact&&(t.contact={email:e.info.contact}),e.info.license&&(t.license={name:e.info.license,url:e.info.licenseUrl}),e.info.termsOfServiceUrl&&(t.termsOfService=e.info.termsOfServiceUrl)),t}function assignPathComponents(e,t){var r=urlParse(e);t.host=r.host,t.basePath=r.path,r.protocol&&(t.schemes=[r.protocol.substr(0,r.protocol.length-1)])}function processDataType(e,t){return e=clone(e),e.$ref&&-1===e.$ref.indexOf("#/definitions/")?e.$ref="#/definitions/"+e.$ref:e.items&&e.items.$ref&&-1===e.items.$ref.indexOf("#/definitions/")&&(e.items.$ref="#/definitions/"+e.items.$ref),t&&e.type&&-1===primitiveTypes.indexOf(e.type)&&(e={$ref:"#/definitions/"+e.type}),e.minimum&&(e.minimum=fixNonStringValue(e.minimum)),e.maximum&&(e.maximum=fixNonStringValue(e.maximum)),e.defaultValue&&(e["default"]=e.defaultValue,delete e.defaultValue,e.type&&"string"!==e.type&&(e["default"]=fixNonStringValue(e["default"]))),e}function buildPath(e,t){var r={};return e.operations.forEach(function(e){var i=e.method.toLowerCase();r[i]=buildOperation(e,t.produces,t.consumes,t.resourcePath)}),r}function buildOperation(e,t,r,i){var n={responses:{},description:e.description||""};if(i&&(n.tags=[],n.tags.push(i.substr(1))),e.summary&&(n.summary=e.summary),e.nickname&&(n.operationId=e.nickname),t&&(n.produces=t),r&&(n.consumes=r),Array.isArray(e.parameters)&&e.parameters.length&&(n.parameters=e.parameters.map(function(e){return buildParameter(e)})),Array.isArray(e.responseMessages)&&e.responseMessages.forEach(function(e){n.responses[e.code]=buildResponse(e)}),(!Object.keys(n.responses).length||!n.responses[200]&&e.type)&&(n.responses[200]={description:"No response was specified"}),e.type&&"void"!==e.type){var o=buildParamType(e);-1===primitiveTypes.indexOf(e.type)&&(o={$ref:"#/definitions/"+e.type}),n.responses[200].schema=o}return n}function buildResponse(e){var t={};return t.description=e.message,t}function buildParameter(e){var t={"in":e.paramType,description:e.description,name:e.name,required:!!e.required};return-1===primitiveTypes.indexOf(e.type)?t.schema={$ref:"#/definitions/"+e.type}:"body"===e.paramType?t.schema=buildParamType(e):extend(t,buildParamType(e)),"form"===t["in"]&&(t["in"]="formData"),t}function buildParamType(e){var t={},r=["default","maximum","minimum","items"];return e=processDataType(e,!1),t.type=e.type.toLowerCase(),r.forEach(function(r){"undefined"!=typeof e[r]&&(t[r]=e[r])}),"undefined"!=typeof e.defaultValue&&(t["default"]=e.defaultValue),t}function buildSecurityDefinitions(e,t){var r={};return Object.keys(e.authorizations).forEach(function(i){var n=e.authorizations[i],o=function(e){var t=r[e||i]={type:n.type};return n.passAs&&(t["in"]=n.passAs),n.keyname&&(t.name=n.keyname),t};n.grantTypes?(t[i]=[],Object.keys(n.grantTypes).forEach(function(e){var r=n.grantTypes[e],s=i+"_"+e,a=o(s);switch(t[i].push(s),"implicit"===e?a.flow="implicit":a.flow="accessCode",e){case"implicit":a.authorizationUrl=r.loginEndpoint.url;break;case"authorization_code":a.authorizationUrl=r.tokenRequestEndpoint.url,a.tokenUrl=r.tokenEndpoint.url}n.scopes&&(a.scopes={},n.scopes.forEach(function(e){a.scopes[e.scope]=e.description||"Undescribed "+e.scope}))})):o()}),r}function transformModel(e){"object"==typeof e.properties&&Object.keys(e.properties).forEach(function(t){e.properties[t]=processDataType(e.properties[t],!0)})}function transformAllModels(e){var t=clone(e);if("object"!=typeof e)throw new Error("models must be object");var r={};return Object.keys(t).forEach(function(e){var i=t[e];delete i.id,transformModel(i),i.subTypes&&(r[e]=i.subTypes,delete i.subTypes)}),Object.keys(r).forEach(function(e){r[e].forEach(function(r){var i=t[r];if(i){var n=(i.allOf||[]).concat({$ref:"#/definitions/"+e}).concat(clone(i));for(var o in i)delete i[o];i.allOf=n}})}),t}function extend(e,t){if("object"!=typeof e)throw new Error("source must be objects");"object"==typeof t&&Object.keys(t).forEach(function(r){e[r]=t[r]})}function fixNonStringValue(e){if("string"!=typeof e)return e;try{return JSON.parse(e)}catch(t){throw Error("incorect property value: "+t.message)}}var urlParse=require("url").parse,clone=require("lodash.clonedeep"),primitiveTypes=["string","number","boolean","integer","array","void","File"];"undefined"==typeof window?module.exports=convert:window.SwaggerConverter=window.SwaggerConverter||{convert:convert};

},{"lodash.clonedeep":158,"url":11}],158:[function(require,module,exports){
function cloneDeep(e,a,l){return baseClone(e,!0,"function"==typeof a&&baseCreateCallback(a,l,1))}var baseClone=require("lodash._baseclone"),baseCreateCallback=require("lodash._basecreatecallback");module.exports=cloneDeep;

},{"lodash._baseclone":159,"lodash._basecreatecallback":181}],159:[function(require,module,exports){
function baseClone(s,e,a,r,l){if(a){var o=a(s);if("undefined"!=typeof o)return o}var t=isObject(s);if(!t)return s;var n=toString.call(s);if(!cloneableClasses[n])return s;var c=ctorByClass[n];switch(n){case boolClass:case dateClass:return new c(+s);case numberClass:case stringClass:return new c(s);case regexpClass:return o=c(s.source,reFlags.exec(s)),o.lastIndex=s.lastIndex,o}var C=isArray(s);if(e){var i=!r;r||(r=getArray()),l||(l=getArray());for(var b=r.length;b--;)if(r[b]==s)return l[b];o=C?c(s.length):{}}else o=C?slice(s):assign({},s);return C&&(hasOwnProperty.call(s,"index")&&(o.index=s.index),hasOwnProperty.call(s,"input")&&(o.input=s.input)),e?(r.push(s),l.push(o),(C?forEach:forOwn)(s,function(s,t){o[t]=baseClone(s,e,a,r,l)}),i&&(releaseArray(r),releaseArray(l)),o):o}var assign=require("lodash.assign"),forEach=require("lodash.foreach"),forOwn=require("lodash.forown"),getArray=require("lodash._getarray"),isArray=require("lodash.isarray"),isObject=require("lodash.isobject"),releaseArray=require("lodash._releasearray"),slice=require("lodash._slice"),reFlags=/\w*$/,argsClass="[object Arguments]",arrayClass="[object Array]",boolClass="[object Boolean]",dateClass="[object Date]",funcClass="[object Function]",numberClass="[object Number]",objectClass="[object Object]",regexpClass="[object RegExp]",stringClass="[object String]",cloneableClasses={};cloneableClasses[funcClass]=!1,cloneableClasses[argsClass]=cloneableClasses[arrayClass]=cloneableClasses[boolClass]=cloneableClasses[dateClass]=cloneableClasses[numberClass]=cloneableClasses[objectClass]=cloneableClasses[regexpClass]=cloneableClasses[stringClass]=!0;var objectProto=Object.prototype,toString=objectProto.toString,hasOwnProperty=objectProto.hasOwnProperty,ctorByClass={};ctorByClass[arrayClass]=Array,ctorByClass[boolClass]=Boolean,ctorByClass[dateClass]=Date,ctorByClass[funcClass]=Function,ctorByClass[objectClass]=Object,ctorByClass[numberClass]=Number,ctorByClass[regexpClass]=RegExp,ctorByClass[stringClass]=String,module.exports=baseClone;

},{"lodash._getarray":160,"lodash._releasearray":162,"lodash._slice":165,"lodash.assign":166,"lodash.foreach":171,"lodash.forown":172,"lodash.isarray":177,"lodash.isobject":179}],160:[function(require,module,exports){
function getArray(){return arrayPool.pop()||[]}var arrayPool=require("lodash._arraypool");module.exports=getArray;

},{"lodash._arraypool":161}],161:[function(require,module,exports){
var arrayPool=[];module.exports=arrayPool;

},{}],162:[function(require,module,exports){
function releaseArray(r){r.length=0,arrayPool.length<maxPoolSize&&arrayPool.push(r)}var arrayPool=require("lodash._arraypool"),maxPoolSize=require("lodash._maxpoolsize");module.exports=releaseArray;

},{"lodash._arraypool":163,"lodash._maxpoolsize":164}],163:[function(require,module,exports){
var arrayPool=[];module.exports=arrayPool;

},{}],164:[function(require,module,exports){
var maxPoolSize=40;module.exports=maxPoolSize;

},{}],165:[function(require,module,exports){
function slice(e,r,n){r||(r=0),"undefined"==typeof n&&(n=e?e.length:0);for(var o=-1,t=n-r||0,f=Array(0>t?0:t);++o<t;)f[o]=e[r+o];return f}module.exports=slice;

},{}],166:[function(require,module,exports){
var baseCreateCallback=require("lodash._basecreatecallback"),keys=require("lodash.keys"),objectTypes=require("lodash._objecttypes"),assign=function(e,a,r){var t,s=e,o=s;if(!s)return o;var n=arguments,f=0,l="number"==typeof r?2:n.length;if(l>3&&"function"==typeof n[l-2])var c=baseCreateCallback(n[--l-1],n[l--],2);else l>2&&"function"==typeof n[l-1]&&(c=n[--l]);for(;++f<l;)if(s=n[f],s&&objectTypes[typeof s])for(var y=-1,b=objectTypes[typeof s]&&keys(s),i=b?b.length:0;++y<i;)t=b[y],o[t]=c?c(o[t],s[t]):s[t];return o};module.exports=assign;

},{"lodash._basecreatecallback":181,"lodash._objecttypes":167,"lodash.keys":168}],167:[function(require,module,exports){
var objectTypes={"boolean":!1,"function":!0,object:!0,number:!1,string:!1,undefined:!1};module.exports=objectTypes;

},{}],168:[function(require,module,exports){
var isNative=require("lodash._isnative"),isObject=require("lodash.isobject"),shimKeys=require("lodash._shimkeys"),nativeKeys=isNative(nativeKeys=Object.keys)&&nativeKeys,keys=nativeKeys?function(e){return isObject(e)?nativeKeys(e):[]}:shimKeys;module.exports=keys;

},{"lodash._isnative":169,"lodash._shimkeys":170,"lodash.isobject":179}],169:[function(require,module,exports){
function isNative(t){return"function"==typeof t&&reNative.test(t)}var objectProto=Object.prototype,toString=objectProto.toString,reNative=RegExp("^"+String(toString).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/toString| for [^\]]+/g,".*?")+"$");module.exports=isNative;

},{}],170:[function(require,module,exports){
var objectTypes=require("lodash._objecttypes"),objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty,shimKeys=function(e){var r,o=e,t=[];if(!o)return t;if(!objectTypes[typeof e])return t;for(r in o)hasOwnProperty.call(o,r)&&t.push(r);return t};module.exports=shimKeys;

},{"lodash._objecttypes":167}],171:[function(require,module,exports){
function forEach(e,r,a){var o=-1,f=e?e.length:0;if(r=r&&"undefined"==typeof a?r:baseCreateCallback(r,a,3),"number"==typeof f)for(;++o<f&&r(e[o],o,e)!==!1;);else forOwn(e,r);return e}var baseCreateCallback=require("lodash._basecreatecallback"),forOwn=require("lodash.forown");module.exports=forEach;

},{"lodash._basecreatecallback":181,"lodash.forown":172}],172:[function(require,module,exports){
var baseCreateCallback=require("lodash._basecreatecallback"),keys=require("lodash.keys"),objectTypes=require("lodash._objecttypes"),forOwn=function(e,r,a){var t,o=e,s=o;if(!o)return s;if(!objectTypes[typeof o])return s;r=r&&"undefined"==typeof a?r:baseCreateCallback(r,a,3);for(var f=-1,l=objectTypes[typeof o]&&keys(o),n=l?l.length:0;++f<n;)if(t=l[f],r(o[t],t,e)===!1)return s;return s};module.exports=forOwn;

},{"lodash._basecreatecallback":181,"lodash._objecttypes":173,"lodash.keys":174}],173:[function(require,module,exports){
var objectTypes={"boolean":!1,"function":!0,object:!0,number:!1,string:!1,undefined:!1};module.exports=objectTypes;

},{}],174:[function(require,module,exports){
var isNative=require("lodash._isnative"),isObject=require("lodash.isobject"),shimKeys=require("lodash._shimkeys"),nativeKeys=isNative(nativeKeys=Object.keys)&&nativeKeys,keys=nativeKeys?function(e){return isObject(e)?nativeKeys(e):[]}:shimKeys;module.exports=keys;

},{"lodash._isnative":175,"lodash._shimkeys":176,"lodash.isobject":179}],175:[function(require,module,exports){
function isNative(t){return"function"==typeof t&&reNative.test(t)}var objectProto=Object.prototype,toString=objectProto.toString,reNative=RegExp("^"+String(toString).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/toString| for [^\]]+/g,".*?")+"$");module.exports=isNative;

},{}],176:[function(require,module,exports){
var objectTypes=require("lodash._objecttypes"),objectProto=Object.prototype,hasOwnProperty=objectProto.hasOwnProperty,shimKeys=function(e){var r,o=e,t=[];if(!o)return t;if(!objectTypes[typeof e])return t;for(r in o)hasOwnProperty.call(o,r)&&t.push(r);return t};module.exports=shimKeys;

},{"lodash._objecttypes":173}],177:[function(require,module,exports){
var isNative=require("lodash._isnative"),arrayClass="[object Array]",objectProto=Object.prototype,toString=objectProto.toString,nativeIsArray=isNative(nativeIsArray=Array.isArray)&&nativeIsArray,isArray=nativeIsArray||function(r){return r&&"object"==typeof r&&"number"==typeof r.length&&toString.call(r)==arrayClass||!1};module.exports=isArray;

},{"lodash._isnative":178}],178:[function(require,module,exports){
function isNative(t){return"function"==typeof t&&reNative.test(t)}var objectProto=Object.prototype,toString=objectProto.toString,reNative=RegExp("^"+String(toString).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/toString| for [^\]]+/g,".*?")+"$");module.exports=isNative;

},{}],179:[function(require,module,exports){
function isObject(e){return!(!e||!objectTypes[typeof e])}var objectTypes=require("lodash._objecttypes");module.exports=isObject;

},{"lodash._objecttypes":180}],180:[function(require,module,exports){
var objectTypes={"boolean":!1,"function":!0,object:!0,number:!1,string:!1,undefined:!1};module.exports=objectTypes;

},{}],181:[function(require,module,exports){
function baseCreateCallback(e,t,n){if("function"!=typeof e)return identity;if("undefined"==typeof t||!("prototype"in e))return e;var r=e.__bindData__;if("undefined"==typeof r&&(support.funcNames&&(r=!e.name),r=r||!support.funcDecomp,!r)){var i=fnToString.call(e);support.funcNames||(r=!reFuncName.test(i)),r||(r=reThis.test(i),setBindData(e,r))}if(r===!1||r!==!0&&1&r[1])return e;switch(n){case 1:return function(n){return e.call(t,n)};case 2:return function(n,r){return e.call(t,n,r)};case 3:return function(n,r,i){return e.call(t,n,r,i)};case 4:return function(n,r,i,a){return e.call(t,n,r,i,a)}}return bind(e,t)}var bind=require("lodash.bind"),identity=require("lodash.identity"),setBindData=require("lodash._setbinddata"),support=require("lodash.support"),reFuncName=/^\s*function[ \n\r\t]+\w/,reThis=/\bthis\b/,fnToString=Function.prototype.toString;module.exports=baseCreateCallback;

},{"lodash._setbinddata":182,"lodash.bind":185,"lodash.identity":201,"lodash.support":202}],182:[function(require,module,exports){
var isNative=require("lodash._isnative"),noop=require("lodash.noop"),descriptor={configurable:!1,enumerable:!1,value:null,writable:!1},defineProperty=function(){try{var e={},r=isNative(r=Object.defineProperty)&&r,t=r(e,e,e)&&r}catch(i){}return t}(),setBindData=defineProperty?function(e,r){descriptor.value=r,defineProperty(e,"__bindData__",descriptor)}:noop;module.exports=setBindData;

},{"lodash._isnative":183,"lodash.noop":184}],183:[function(require,module,exports){
function isNative(t){return"function"==typeof t&&reNative.test(t)}var objectProto=Object.prototype,toString=objectProto.toString,reNative=RegExp("^"+String(toString).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/toString| for [^\]]+/g,".*?")+"$");module.exports=isNative;

},{}],184:[function(require,module,exports){
function noop(){}module.exports=noop;

},{}],185:[function(require,module,exports){
function bind(e,r){return arguments.length>2?createWrapper(e,17,slice(arguments,2),null,r):createWrapper(e,1,null,null,r)}var createWrapper=require("lodash._createwrapper"),slice=require("lodash._slice");module.exports=bind;

},{"lodash._createwrapper":186,"lodash._slice":200}],186:[function(require,module,exports){
function createWrapper(e,r,a,i,s,p){var n=1&r,t=2&r,u=4&r,l=16&r,c=32&r;if(!t&&!isFunction(e))throw new TypeError;l&&!a.length&&(r&=-17,l=a=!1),c&&!i.length&&(r&=-33,c=i=!1);var h=e&&e.__bindData__;if(h&&h!==!0)return h=slice(h),h[2]&&(h[2]=slice(h[2])),h[3]&&(h[3]=slice(h[3])),!n||1&h[1]||(h[4]=s),!n&&1&h[1]&&(r|=8),!u||4&h[1]||(h[5]=p),l&&push.apply(h[2]||(h[2]=[]),a),c&&unshift.apply(h[3]||(h[3]=[]),i),h[1]|=r,createWrapper.apply(null,h);var o=1==r||17===r?baseBind:baseCreateWrapper;return o([e,r,a,i,s,p])}var baseBind=require("lodash._basebind"),baseCreateWrapper=require("lodash._basecreatewrapper"),isFunction=require("lodash.isfunction"),slice=require("lodash._slice"),arrayRef=[],push=arrayRef.push,unshift=arrayRef.unshift;module.exports=createWrapper;

},{"lodash._basebind":187,"lodash._basecreatewrapper":193,"lodash._slice":200,"lodash.isfunction":199}],187:[function(require,module,exports){
function baseBind(e){function a(){if(s){var e=slice(s);push.apply(e,arguments)}if(this instanceof a){var i=baseCreate(r.prototype),n=r.apply(i,e||arguments);return isObject(n)?n:i}return r.apply(t,e||arguments)}var r=e[0],s=e[2],t=e[4];return setBindData(a,e),a}var baseCreate=require("lodash._basecreate"),isObject=require("lodash.isobject"),setBindData=require("lodash._setbinddata"),slice=require("lodash._slice"),arrayRef=[],push=arrayRef.push;module.exports=baseBind;

},{"lodash._basecreate":188,"lodash._setbinddata":182,"lodash._slice":200,"lodash.isobject":191}],188:[function(require,module,exports){
(function (global){
function baseCreate(e,t){return isObject(e)?nativeCreate(e):{}}var isNative=require("lodash._isnative"),isObject=require("lodash.isobject"),noop=require("lodash.noop"),nativeCreate=isNative(nativeCreate=Object.create)&&nativeCreate;nativeCreate||(baseCreate=function(){function e(){}return function(t){if(isObject(t)){e.prototype=t;var a=new e;e.prototype=null}return a||global.Object()}}()),module.exports=baseCreate;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"lodash._isnative":189,"lodash.isobject":191,"lodash.noop":190}],189:[function(require,module,exports){
function isNative(t){return"function"==typeof t&&reNative.test(t)}var objectProto=Object.prototype,toString=objectProto.toString,reNative=RegExp("^"+String(toString).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/toString| for [^\]]+/g,".*?")+"$");module.exports=isNative;

},{}],190:[function(require,module,exports){
function noop(){}module.exports=noop;

},{}],191:[function(require,module,exports){
function isObject(e){return!(!e||!objectTypes[typeof e])}var objectTypes=require("lodash._objecttypes");module.exports=isObject;

},{"lodash._objecttypes":192}],192:[function(require,module,exports){
var objectTypes={"boolean":!1,"function":!0,object:!0,number:!1,string:!1,undefined:!1};module.exports=objectTypes;

},{}],193:[function(require,module,exports){
function baseCreateWrapper(e){function a(){var e=n?p:this;if(t){var b=slice(t);push.apply(b,arguments)}if((i||o)&&(b||(b=slice(arguments)),i&&push.apply(b,i),o&&b.length<u))return s|=16,baseCreateWrapper([r,c?s:-4&s,b,null,p,u]);if(b||(b=arguments),l&&(r=e[h]),this instanceof a){e=baseCreate(r.prototype);var d=r.apply(e,b);return isObject(d)?d:e}return r.apply(e,b)}var r=e[0],s=e[1],t=e[2],i=e[3],p=e[4],u=e[5],n=1&s,l=2&s,o=4&s,c=8&s,h=r;return setBindData(a,e),a}var baseCreate=require("lodash._basecreate"),isObject=require("lodash.isobject"),setBindData=require("lodash._setbinddata"),slice=require("lodash._slice"),arrayRef=[],push=arrayRef.push;module.exports=baseCreateWrapper;

},{"lodash._basecreate":194,"lodash._setbinddata":182,"lodash._slice":200,"lodash.isobject":197}],194:[function(require,module,exports){
(function (global){
function baseCreate(e,t){return isObject(e)?nativeCreate(e):{}}var isNative=require("lodash._isnative"),isObject=require("lodash.isobject"),noop=require("lodash.noop"),nativeCreate=isNative(nativeCreate=Object.create)&&nativeCreate;nativeCreate||(baseCreate=function(){function e(){}return function(t){if(isObject(t)){e.prototype=t;var a=new e;e.prototype=null}return a||global.Object()}}()),module.exports=baseCreate;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"lodash._isnative":195,"lodash.isobject":197,"lodash.noop":196}],195:[function(require,module,exports){
function isNative(t){return"function"==typeof t&&reNative.test(t)}var objectProto=Object.prototype,toString=objectProto.toString,reNative=RegExp("^"+String(toString).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/toString| for [^\]]+/g,".*?")+"$");module.exports=isNative;

},{}],196:[function(require,module,exports){
function noop(){}module.exports=noop;

},{}],197:[function(require,module,exports){
function isObject(e){return!(!e||!objectTypes[typeof e])}var objectTypes=require("lodash._objecttypes");module.exports=isObject;

},{"lodash._objecttypes":198}],198:[function(require,module,exports){
var objectTypes={"boolean":!1,"function":!0,object:!0,number:!1,string:!1,undefined:!1};module.exports=objectTypes;

},{}],199:[function(require,module,exports){
function isFunction(n){return"function"==typeof n}module.exports=isFunction;

},{}],200:[function(require,module,exports){
function slice(e,r,n){r||(r=0),"undefined"==typeof n&&(n=e?e.length:0);for(var o=-1,t=n-r||0,f=Array(0>t?0:t);++o<t;)f[o]=e[r+o];return f}module.exports=slice;

},{}],201:[function(require,module,exports){
function identity(t){return t}module.exports=identity;

},{}],202:[function(require,module,exports){
(function (global){
var isNative=require("lodash._isnative"),reThis=/\bthis\b/,support={};support.funcDecomp=!isNative(global.WinRTError)&&reThis.test(function(){return this}),support.funcNames="string"==typeof Function.name,module.exports=support;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"lodash._isnative":203}],203:[function(require,module,exports){
function isNative(t){return"function"==typeof t&&reNative.test(t)}var objectProto=Object.prototype,toString=objectProto.toString,reNative=RegExp("^"+String(toString).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/toString| for [^\]]+/g,".*?")+"$");module.exports=isNative;

},{}],204:[function(require,module,exports){
function Traverse(e){this.value=e}function walk(e,t,r){var o=[],n=[],a=!0;return function i(e){function c(){if("object"==typeof l.node&&null!==l.node){l.keys&&l.node_===l.node||(l.keys=objectKeys(l.node)),l.isLeaf=0==l.keys.length;for(var t=0;t<n.length;t++)if(n[t].node_===e){l.circular=n[t];break}}else l.isLeaf=!0,l.keys=null;l.notLeaf=!l.isLeaf,l.notRoot=!l.isRoot}var s=r?copy(e):e,u={},f=!0,l={node:s,node_:e,path:[].concat(o),parent:n[n.length-1],parents:n,key:o.slice(-1)[0],isRoot:0===o.length,level:o.length,circular:null,update:function(e,t){l.isRoot||(l.parent.node[l.key]=e),l.node=e,t&&(f=!1)},"delete":function(e){delete l.parent.node[l.key],e&&(f=!1)},remove:function(e){isArray(l.parent.node)?l.parent.node.splice(l.key,1):delete l.parent.node[l.key],e&&(f=!1)},keys:null,before:function(e){u.before=e},after:function(e){u.after=e},pre:function(e){u.pre=e},post:function(e){u.post=e},stop:function(){a=!1},block:function(){f=!1}};if(!a)return l;c();var p=t.call(l,l.node);return void 0!==p&&l.update&&l.update(p),u.before&&u.before.call(l,l.node),f?("object"!=typeof l.node||null===l.node||l.circular||(n.push(l),c(),forEach(l.keys,function(e,t){o.push(e),u.pre&&u.pre.call(l,l.node[e],e);var n=i(l.node[e]);r&&hasOwnProperty.call(l.node,e)&&(l.node[e]=n.node),n.isLast=t==l.keys.length-1,n.isFirst=0==t,u.post&&u.post.call(l,n),o.pop()}),n.pop()),u.after&&u.after.call(l,l.node),l):l}(e).node}function copy(e){if("object"==typeof e&&null!==e){var t;if(isArray(e))t=[];else if(isDate(e))t=new Date(e.getTime?e.getTime():e);else if(isRegExp(e))t=new RegExp(e);else if(isError(e))t={message:e.message};else if(isBoolean(e))t=new Boolean(e);else if(isNumber(e))t=new Number(e);else if(isString(e))t=new String(e);else if(Object.create&&Object.getPrototypeOf)t=Object.create(Object.getPrototypeOf(e));else if(e.constructor===Object)t={};else{var r=e.constructor&&e.constructor.prototype||e.__proto__||{},o=function(){};o.prototype=r,t=new o}return forEach(objectKeys(e),function(r){t[r]=e[r]}),t}return e}function toS(e){return Object.prototype.toString.call(e)}function isDate(e){return"[object Date]"===toS(e)}function isRegExp(e){return"[object RegExp]"===toS(e)}function isError(e){return"[object Error]"===toS(e)}function isBoolean(e){return"[object Boolean]"===toS(e)}function isNumber(e){return"[object Number]"===toS(e)}function isString(e){return"[object String]"===toS(e)}var traverse=module.exports=function(e){return new Traverse(e)};Traverse.prototype.get=function(e){for(var t=this.value,r=0;r<e.length;r++){var o=e[r];if(!t||!hasOwnProperty.call(t,o)){t=void 0;break}t=t[o]}return t},Traverse.prototype.has=function(e){for(var t=this.value,r=0;r<e.length;r++){var o=e[r];if(!t||!hasOwnProperty.call(t,o))return!1;t=t[o]}return!0},Traverse.prototype.set=function(e,t){for(var r=this.value,o=0;o<e.length-1;o++){var n=e[o];hasOwnProperty.call(r,n)||(r[n]={}),r=r[n]}return r[e[o]]=t,t},Traverse.prototype.map=function(e){return walk(this.value,e,!0)},Traverse.prototype.forEach=function(e){return this.value=walk(this.value,e,!1),this.value},Traverse.prototype.reduce=function(e,t){var r=1===arguments.length,o=r?this.value:t;return this.forEach(function(t){this.isRoot&&r||(o=e.call(this,o,t))}),o},Traverse.prototype.paths=function(){var e=[];return this.forEach(function(t){e.push(this.path)}),e},Traverse.prototype.nodes=function(){var e=[];return this.forEach(function(t){e.push(this.node)}),e},Traverse.prototype.clone=function(){var e=[],t=[];return function r(o){for(var n=0;n<e.length;n++)if(e[n]===o)return t[n];if("object"==typeof o&&null!==o){var a=copy(o);return e.push(o),t.push(a),forEach(objectKeys(o),function(e){a[e]=r(o[e])}),e.pop(),t.pop(),a}return o}(this.value)};var objectKeys=Object.keys||function(e){var t=[];for(var r in e)t.push(r);return t},isArray=Array.isArray||function(e){return"[object Array]"===Object.prototype.toString.call(e)},forEach=function(e,t){if(e.forEach)return e.forEach(t);for(var r=0;r<e.length;r++)t(e[r],r,e)};forEach(objectKeys(Traverse.prototype),function(e){traverse[e]=function(t){var r=[].slice.call(arguments,1),o=new Traverse(t);return o[e].apply(o,r)}});var hasOwnProperty=Object.hasOwnProperty||function(e,t){return t in e};

},{}],205:[function(require,module,exports){
!function(t,e){"undefined"!=typeof exports&&"undefined"!=typeof module?module.exports=e():"function"==typeof define&&"object"==typeof define.amd?define(e):this[t]=e()}("validator",function(t){"use strict";function e(t,e){t=t||{};for(var r in e)"undefined"==typeof t[r]&&(t[r]=e[r]);return t}function r(t){var e="(\\"+t.symbol.replace(/\./g,"\\.")+")"+(t.require_symbol?"":"?"),r="-?",n="[1-9]\\d*",i="[1-9]\\d{0,2}(\\"+t.thousands_separator+"\\d{3})*",o=["0",n,i],u="("+o.join("|")+")?",a="(\\"+t.decimal_separator+"\\d{2})?",s=u+a;return t.allow_negatives&&!t.parens_for_negatives&&(t.negative_sign_after_digits?s+=r:t.negative_sign_before_digits&&(s=r+s)),t.allow_negative_sign_placeholder?s="( (?!\\-))?"+s:t.allow_space_after_symbol?s=" ?"+s:t.allow_space_after_digits&&(s+="( (?!$))?"),t.symbol_after_digits?s+=e:s=e+s,t.allow_negatives&&(t.parens_for_negatives?s="(\\("+s+"\\)|"+s+")":t.negative_sign_before_digits||t.negative_sign_after_digits||(s=r+s)),new RegExp("^(?!-? )(?=.*\\d)"+s+"$")}t={version:"3.41.2"};var n=/^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e])|(\\[\x01-\x09\x0b\x0c\x0d-\x7f])))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))$/i,i=/^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))$/i,o=/^(?:[a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~\.]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(?:[a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~\.]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]|\s)*<(.+)>$/i,u=/^(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|6(?:011|5[0-9][0-9])[0-9]{12}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|(?:2131|1800|35\d{3})\d{11})$/,a=/^[A-Z]{2}[0-9A-Z]{9}[0-9]$/,s=/^(?:[0-9]{9}X|[0-9]{10})$/,l=/^(?:[0-9]{13})$/,f=/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/,c=/^[0-9A-F]{1,4}$/i,F={3:/^[0-9A-F]{8}-[0-9A-F]{4}-3[0-9A-F]{3}-[0-9A-F]{4}-[0-9A-F]{12}$/i,4:/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,5:/^[0-9A-F]{8}-[0-9A-F]{4}-5[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,all:/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i},g=/^[A-Z]+$/i,p=/^[0-9A-Z]+$/i,x=/^[-+]?[0-9]+$/,d=/^(?:[-+]?(?:0|[1-9][0-9]*))$/,_=/^(?:[-+]?(?:[0-9]+))?(?:\.[0-9]*)?(?:[eE][\+\-]?(?:[0-9]+))?$/,h=/^[0-9A-F]+$/i,A=/^#?([0-9A-F]{3}|[0-9A-F]{6})$/i,v=/^[\x00-\x7F]+$/,m=/[^\x00-\x7F]/,w=/[^\u0020-\u007E\uFF61-\uFF9F\uFFA0-\uFFDC\uFFE8-\uFFEE0-9a-zA-Z]/,$=/[\u0020-\u007E\uFF61-\uFF9F\uFFA0-\uFFDC\uFFE8-\uFFEE0-9a-zA-Z]/,D=/[\uD800-\uDBFF][\uDC00-\uDFFF]/,b=/^(?:[A-Z0-9+\/]{4})*(?:[A-Z0-9+\/]{2}==|[A-Z0-9+\/]{3}=|[A-Z0-9+\/]{4})$/i,y={"zh-CN":/^(\+?0?86\-?)?1[345789]\d{9}$/,"en-ZA":/^(\+?27|0)\d{9}$/,"en-AU":/^(\+?61|0)4\d{8}$/,"en-HK":/^(\+?852\-?)?[569]\d{3}\-?\d{4}$/,"fr-FR":/^(\+?33|0)[67]\d{8}$/,"pt-PT":/^(\+351)?9[1236]\d{7}$/,"el-GR":/^(\+30)?((2\d{9})|(69\d{8}))$/,"en-GB":/^(\+?44|0)7\d{9}$/,"en-US":/^(\+?1)?[2-9]\d{2}[2-9](?!11)\d{6}$/,"en-ZM":/^(\+26)?09[567]\d{7}$/,"ru-RU":/^(\+?7|8)?9\d{9}$/};t.extend=function(e,r){t[e]=function(){var e=Array.prototype.slice.call(arguments);return e[0]=t.toString(e[0]),r.apply(t,e)}},t.init=function(){for(var e in t)"function"==typeof t[e]&&"toString"!==e&&"toDate"!==e&&"extend"!==e&&"init"!==e&&t.extend(e,t[e])},t.toString=function(t){return"object"==typeof t&&null!==t&&t.toString?t=t.toString():null===t||"undefined"==typeof t||isNaN(t)&&!t.length?t="":"string"!=typeof t&&(t+=""),t},t.toDate=function(t){return"[object Date]"===Object.prototype.toString.call(t)?t:(t=Date.parse(t),isNaN(t)?null:new Date(t))},t.toFloat=function(t){return parseFloat(t)},t.toInt=function(t,e){return parseInt(t,e||10)},t.toBoolean=function(t,e){return e?"1"===t||"true"===t:"0"!==t&&"false"!==t&&""!==t},t.equals=function(e,r){return e===t.toString(r)},t.contains=function(e,r){return e.indexOf(t.toString(r))>=0},t.matches=function(t,e,r){return"[object RegExp]"!==Object.prototype.toString.call(e)&&(e=new RegExp(e,r)),e.test(t)};var E={allow_display_name:!1,allow_utf8_local_part:!0,require_tld:!0};t.isEmail=function(r,u){if(u=e(u,E),u.allow_display_name){var a=r.match(o);a&&(r=a[1])}else if(/\s/.test(r))return!1;var s=r.split("@"),l=s.pop(),f=s.join("@"),c=l.toLowerCase();return("gmail.com"===c||"googlemail.com"===c)&&(f=f.replace(/\./g,"").toLowerCase()),t.isFQDN(l,{require_tld:u.require_tld})?u.allow_utf8_local_part?i.test(f):n.test(f):!1};var C={protocols:["http","https","ftp"],require_tld:!0,require_protocol:!1,allow_underscores:!1,allow_trailing_dot:!1,allow_protocol_relative_urls:!1};t.isURL=function(r,n){if(!r||r.length>=2083||/\s/.test(r))return!1;if(0===r.indexOf("mailto:"))return!1;n=e(n,C);var i,o,u,a,s,l,f;if(f=r.split("://"),f.length>1){if(i=f.shift(),-1===n.protocols.indexOf(i))return!1}else{if(n.require_protocol)return!1;n.allow_protocol_relative_urls&&"//"===r.substr(0,2)&&(f[0]=r.substr(2))}return r=f.join("://"),f=r.split("#"),r=f.shift(),f=r.split("?"),r=f.shift(),f=r.split("/"),r=f.shift(),f=r.split("@"),f.length>1&&(o=f.shift(),o.indexOf(":")>=0&&o.split(":").length>2)?!1:(a=f.join("@"),f=a.split(":"),u=f.shift(),f.length&&(l=f.join(":"),s=parseInt(l,10),!/^[0-9]+$/.test(l)||0>=s||s>65535)?!1:t.isIP(u)||t.isFQDN(u,n)||"localhost"===u?n.host_whitelist&&-1===n.host_whitelist.indexOf(u)?!1:n.host_blacklist&&-1!==n.host_blacklist.indexOf(u)?!1:!0:!1)},t.isIP=function(e,r){if(r=t.toString(r),!r)return t.isIP(e,4)||t.isIP(e,6);if("4"===r){if(!f.test(e))return!1;var n=e.split(".").sort(function(t,e){return t-e});return n[3]<=255}if("6"===r){var i=e.split(":"),o=!1,u=t.isIP(i[i.length-1],4),a=u?7:8;if(i.length>a)return!1;if("::"===e)return!0;"::"===e.substr(0,2)?(i.shift(),i.shift(),o=!0):"::"===e.substr(e.length-2)&&(i.pop(),i.pop(),o=!0);for(var s=0;s<i.length;++s)if(""===i[s]&&s>0&&s<i.length-1){if(o)return!1;o=!0}else if(u&&s==i.length-1);else if(!c.test(i[s]))return!1;return o?i.length>=1:i.length===a}return!1};var I={require_tld:!0,allow_underscores:!1,allow_trailing_dot:!1};t.isFQDN=function(t,r){r=e(r,I),r.allow_trailing_dot&&"."===t[t.length-1]&&(t=t.substring(0,t.length-1));var n=t.split(".");if(r.require_tld){var i=n.pop();if(!n.length||!/^([a-z\u00a1-\uffff]{2,}|xn[a-z0-9-]{2,})$/i.test(i))return!1}for(var o,u=0;u<n.length;u++){if(o=n[u],r.allow_underscores){if(o.indexOf("__")>=0)return!1;o=o.replace(/_/g,"")}if(!/^[a-z\u00a1-\uffff0-9-]+$/i.test(o))return!1;if("-"===o[0]||"-"===o[o.length-1]||o.indexOf("---")>=0)return!1}return!0},t.isBoolean=function(t){return["true","false","1","0"].indexOf(t)>=0},t.isAlpha=function(t){return g.test(t)},t.isAlphanumeric=function(t){return p.test(t)},t.isNumeric=function(t){return x.test(t)},t.isHexadecimal=function(t){return h.test(t)},t.isHexColor=function(t){return A.test(t)},t.isLowercase=function(t){return t===t.toLowerCase()},t.isUppercase=function(t){return t===t.toUpperCase()},t.isInt=function(t,e){return e=e||{},d.test(t)&&(!e.hasOwnProperty("min")||t>=e.min)&&(!e.hasOwnProperty("max")||t<=e.max)},t.isFloat=function(t,e){return e=e||{},""!==t&&_.test(t)&&(!e.hasOwnProperty("min")||t>=e.min)&&(!e.hasOwnProperty("max")||t<=e.max)},t.isDivisibleBy=function(e,r){return t.toFloat(e)%t.toInt(r)===0},t.isNull=function(t){return 0===t.length},t.isLength=function(t,e,r){var n=t.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g)||[],i=t.length-n.length;return i>=e&&("undefined"==typeof r||r>=i)},t.isByteLength=function(t,e,r){return t.length>=e&&("undefined"==typeof r||t.length<=r)},t.isUUID=function(t,e){var r=F[e?e:"all"];return r&&r.test(t)},t.isDate=function(t){return!isNaN(Date.parse(t))},t.isAfter=function(e,r){var n=t.toDate(r||new Date),i=t.toDate(e);return!!(i&&n&&i>n)},t.isBefore=function(e,r){var n=t.toDate(r||new Date),i=t.toDate(e);return i&&n&&n>i},t.isIn=function(e,r){var n;if("[object Array]"===Object.prototype.toString.call(r)){var i=[];for(n in r)i[n]=t.toString(r[n]);return i.indexOf(e)>=0}return"object"==typeof r?r.hasOwnProperty(e):r&&"function"==typeof r.indexOf?r.indexOf(e)>=0:!1},t.isCreditCard=function(t){var e=t.replace(/[^0-9]+/g,"");if(!u.test(e))return!1;for(var r,n,i,o=0,a=e.length-1;a>=0;a--)r=e.substring(a,a+1),n=parseInt(r,10),i?(n*=2,o+=n>=10?n%10+1:n):o+=n,i=!i;return!!(o%10===0?e:!1)},t.isISIN=function(t){if(!a.test(t))return!1;for(var e,r,n=t.replace(/[A-Z]/g,function(t){return parseInt(t,36)}),i=0,o=!0,u=n.length-2;u>=0;u--)e=n.substring(u,u+1),r=parseInt(e,10),o?(r*=2,i+=r>=10?r+1:r):i+=r,o=!o;return parseInt(t.substr(t.length-1),10)===(1e4-i)%10},t.isISBN=function(e,r){if(r=t.toString(r),!r)return t.isISBN(e,10)||t.isISBN(e,13);var n,i=e.replace(/[\s-]+/g,""),o=0;if("10"===r){if(!s.test(i))return!1;for(n=0;9>n;n++)o+=(n+1)*i.charAt(n);if(o+="X"===i.charAt(9)?100:10*i.charAt(9),o%11===0)return!!i}else if("13"===r){if(!l.test(i))return!1;var u=[1,3];for(n=0;12>n;n++)o+=u[n%2]*i.charAt(n);if(i.charAt(12)-(10-o%10)%10===0)return!!i}return!1},t.isMobilePhone=function(t,e){return e in y?y[e].test(t):!1};var O={symbol:"$",require_symbol:!1,allow_space_after_symbol:!1,symbol_after_digits:!1,allow_negatives:!0,parens_for_negatives:!1,negative_sign_before_digits:!1,negative_sign_after_digits:!1,allow_negative_sign_placeholder:!1,thousands_separator:",",decimal_separator:".",allow_space_after_digits:!1};t.isCurrency=function(t,n){return n=e(n,O),r(n).test(t)},t.isJSON=function(t){try{JSON.parse(t)}catch(e){return!1}return!0},t.isMultibyte=function(t){return m.test(t)},t.isAscii=function(t){return v.test(t)},t.isFullWidth=function(t){return w.test(t)},t.isHalfWidth=function(t){return $.test(t)},t.isVariableWidth=function(t){return w.test(t)&&$.test(t)},t.isSurrogatePair=function(t){return D.test(t)},t.isBase64=function(t){return b.test(t)},t.isMongoId=function(e){return t.isHexadecimal(e)&&24===e.length},t.ltrim=function(t,e){var r=e?new RegExp("^["+e+"]+","g"):/^\s+/g;return t.replace(r,"")},t.rtrim=function(t,e){var r=e?new RegExp("["+e+"]+$","g"):/\s+$/g;return t.replace(r,"")},t.trim=function(t,e){var r=e?new RegExp("^["+e+"]+|["+e+"]+$","g"):/^\s+|\s+$/g;return t.replace(r,"")},t.escape=function(t){return t.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/'/g,"&#x27;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\//g,"&#x2F;").replace(/\`/g,"&#96;")},t.stripLow=function(e,r){var n=r?"\\x00-\\x09\\x0B\\x0C\\x0E-\\x1F\\x7F":"\\x00-\\x1F\\x7F";return t.blacklist(e,n)},t.whitelist=function(t,e){return t.replace(new RegExp("[^"+e+"]+","g"),"")},t.blacklist=function(t,e){return t.replace(new RegExp("["+e+"]+","g"),"")};var S={lowercase:!0};return t.normalizeEmail=function(r,n){if(n=e(n,S),!t.isEmail(r))return!1;var i=r.split("@",2);if(i[1]=i[1].toLowerCase(),"gmail.com"===i[1]||"googlemail.com"===i[1]){if(i[0]=i[0].toLowerCase().replace(/\./g,""),"+"===i[0][0])return!1;i[0]=i[0].split("+")[0],i[1]="gmail.com"}else n.lowercase&&(i[0]=i[0].toLowerCase());return i.join("@")},t.init(),t});

},{}],206:[function(require,module,exports){
"use strict";module.exports={INVALID_TYPE:"Expected type {0} but found type {1}",INVALID_FORMAT:"Object didn't pass validation for format {0}: {1}",ENUM_MISMATCH:"No enum match for: {0}",ANY_OF_MISSING:"Data does not match any schemas from 'anyOf'",ONE_OF_MISSING:"Data does not match any schemas from 'oneOf'",ONE_OF_MULTIPLE:"Data is valid against more than one schema from 'oneOf'",NOT_PASSED:"Data matches schema from 'not'",ARRAY_LENGTH_SHORT:"Array is too short ({0}), minimum {1}",ARRAY_LENGTH_LONG:"Array is too long ({0}), maximum {1}",ARRAY_UNIQUE:"Array items are not unique (indexes {0} and {1})",ARRAY_ADDITIONAL_ITEMS:"Additional items not allowed",MULTIPLE_OF:"Value {0} is not a multiple of {1}",MINIMUM:"Value {0} is less than minimum {1}",MINIMUM_EXCLUSIVE:"Value {0} is equal or less than exclusive minimum {1}",MAXIMUM:"Value {0} is greater than maximum {1}",MAXIMUM_EXCLUSIVE:"Value {0} is equal or greater than exclusive maximum {1}",OBJECT_PROPERTIES_MINIMUM:"Too few properties defined ({0}), minimum {1}",OBJECT_PROPERTIES_MAXIMUM:"Too many properties defined ({0}), maximum {1}",OBJECT_MISSING_REQUIRED_PROPERTY:"Missing required property: {0}",OBJECT_ADDITIONAL_PROPERTIES:"Additional properties not allowed: {0}",OBJECT_DEPENDENCY_KEY:"Dependency failed - key must exist: {0} (due to key: {1})",MIN_LENGTH:"String is too short ({0} chars), minimum {1}",MAX_LENGTH:"String is too long ({0} chars), maximum {1}",PATTERN:"String does not match pattern {0}: {1}",KEYWORD_TYPE_EXPECTED:"Keyword '{0}' is expected to be of type '{1}'",KEYWORD_UNDEFINED_STRICT:"Keyword '{0}' must be defined in strict mode",KEYWORD_UNEXPECTED:"Keyword '{0}' is not expected to appear in the schema",KEYWORD_MUST_BE:"Keyword '{0}' must be {1}",KEYWORD_DEPENDENCY:"Keyword '{0}' requires keyword '{1}'",KEYWORD_PATTERN:"Keyword '{0}' is not a valid RegExp pattern: {1}",KEYWORD_VALUE_TYPE:"Each element of keyword '{0}' array must be a '{1}'",UNKNOWN_FORMAT:"There is no validation function for format '{0}'",CUSTOM_MODE_FORCE_PROPERTIES:"{0} must define at least one property if present",REF_UNRESOLVED:"Reference has not been resolved during compilation: {0}",UNRESOLVABLE_REFERENCE:"Reference could not be resolved: {0}",SCHEMA_NOT_REACHABLE:"Validator was not able to read schema with uri: {0}",SCHEMA_TYPE_EXPECTED:"Schema is expected to be of type 'object'",SCHEMA_NOT_AN_OBJECT:"Schema is not an object: {0}",ASYNC_TIMEOUT:"{0} asynchronous task(s) have timed out after {1} ms",PARENT_SCHEMA_VALIDATION_FAILED:"Schema failed to validate against its parent schema, see inner errors for details.",REMOTE_NOT_VALID:"Remote reference didn't compile successfully: {0}"};

},{}],207:[function(require,module,exports){
var validator=require("validator"),FormatValidators={date:function(t){if("string"!=typeof t)return!0;var r=/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(t);return null===r?!1:r[2]<"01"||r[2]>"12"||r[3]<"01"||r[3]>"31"?!1:!0},"date-time":function(t){if("string"!=typeof t)return!0;var r=t.toLowerCase().split("t");if(!FormatValidators.date(r[0]))return!1;var i=/^([0-9]{2}):([0-9]{2}):([0-9]{2})(.[0-9]+)?(z|([+-][0-9]{2}:[0-9]{2}))$/.exec(r[1]);return null===i?!1:i[1]>"23"||i[2]>"59"||i[3]>"59"?!1:!0},email:function(t){return"string"!=typeof t?!0:validator.isEmail(t,{require_tld:!0})},hostname:function(t){if("string"!=typeof t)return!0;var r=/^[a-zA-Z](([-0-9a-zA-Z]+)?[0-9a-zA-Z])?(\.[a-zA-Z](([-0-9a-zA-Z]+)?[0-9a-zA-Z])?)*$/.test(t);if(r){if(t.length>255)return!1;for(var i=t.split("."),e=0;e<i.length;e++)if(i[e].length>63)return!1}return r},"host-name":function(t){return FormatValidators.hostname.call(this,t)},ipv4:function(t){return"string"!=typeof t?!0:validator.isIP(t,4)},ipv6:function(t){return"string"!=typeof t?!0:validator.isIP(t,6)},regex:function(t){try{return RegExp(t),!0}catch(r){return!1}},uri:function(t){return this.options.strictUris?FormatValidators["strict-uri"].apply(this,arguments):"string"!=typeof t||RegExp("^(([^:/?#]+):)?(//([^/?#]*))?([^?#]*)(\\?([^#]*))?(#(.*))?").test(t)},"strict-uri":function(t){return"string"!=typeof t||validator.isURL(t)}};module.exports=FormatValidators;

},{"validator":205}],208:[function(require,module,exports){
"use strict";var FormatValidators=require("./FormatValidators"),Report=require("./Report"),Utils=require("./Utils"),JsonValidators={multipleOf:function(r,e,t){"number"==typeof t&&"integer"!==Utils.whatIs(t/e.multipleOf)&&r.addError("MULTIPLE_OF",[t,e.multipleOf],null,e.description)},maximum:function(r,e,t){"number"==typeof t&&(e.exclusiveMaximum!==!0?t>e.maximum&&r.addError("MAXIMUM",[t,e.maximum],null,e.description):t>=e.maximum&&r.addError("MAXIMUM_EXCLUSIVE",[t,e.maximum],null,e.description))},exclusiveMaximum:function(){},minimum:function(r,e,t){"number"==typeof t&&(e.exclusiveMinimum!==!0?t<e.minimum&&r.addError("MINIMUM",[t,e.minimum],null,e.description):t<=e.minimum&&r.addError("MINIMUM_EXCLUSIVE",[t,e.minimum],null,e.description))},exclusiveMinimum:function(){},maxLength:function(r,e,t){"string"==typeof t&&Utils.ucs2decode(t).length>e.maxLength&&r.addError("MAX_LENGTH",[t.length,e.maxLength],null,e.description)},minLength:function(r,e,t){"string"==typeof t&&Utils.ucs2decode(t).length<e.minLength&&r.addError("MIN_LENGTH",[t.length,e.minLength],null,e.description)},pattern:function(r,e,t){"string"==typeof t&&RegExp(e.pattern).test(t)===!1&&r.addError("PATTERN",[e.pattern,t],null,e.description)},additionalItems:function(r,e,t){Array.isArray(t)&&e.additionalItems===!1&&Array.isArray(e.items)&&t.length>e.items.length&&r.addError("ARRAY_ADDITIONAL_ITEMS",null,null,e.description)},items:function(){},maxItems:function(r,e,t){Array.isArray(t)&&t.length>e.maxItems&&r.addError("ARRAY_LENGTH_LONG",[t.length,e.maxItems],null,e.description)},minItems:function(r,e,t){Array.isArray(t)&&t.length<e.minItems&&r.addError("ARRAY_LENGTH_SHORT",[t.length,e.minItems],null,e.description)},uniqueItems:function(r,e,t){if(Array.isArray(t)&&e.uniqueItems===!0){var i=[];Utils.isUniqueArray(t,i)===!1&&r.addError("ARRAY_UNIQUE",i,null,e.description)}},maxProperties:function(r,e,t){if("object"===Utils.whatIs(t)){var i=Object.keys(t).length;i>e.maxProperties&&r.addError("OBJECT_PROPERTIES_MAXIMUM",[i,e.maxProperties],null,e.description)}},minProperties:function(r,e,t){if("object"===Utils.whatIs(t)){var i=Object.keys(t).length;i<e.minProperties&&r.addError("OBJECT_PROPERTIES_MINIMUM",[i,e.minProperties],null,e.description)}},required:function(r,e,t){if("object"===Utils.whatIs(t))for(var i=e.required.length;i--;){var n=e.required[i];void 0===t[n]&&r.addError("OBJECT_MISSING_REQUIRED_PROPERTY",[n],null,e.description)}},additionalProperties:function(r,e,t){return void 0===e.properties&&void 0===e.patternProperties?JsonValidators.properties.call(this,r,e,t):void 0},patternProperties:function(r,e,t){return void 0===e.properties?JsonValidators.properties.call(this,r,e,t):void 0},properties:function(r,e,t){if("object"===Utils.whatIs(t)){var i=void 0!==e.properties?e.properties:{},n=void 0!==e.patternProperties?e.patternProperties:{};if(e.additionalProperties===!1){var o=Object.keys(t),a=Object.keys(i),s=Object.keys(n);o=Utils.difference(o,a);for(var l=s.length;l--;)for(var d=RegExp(s[l]),p=o.length;p--;)d.test(o[p])===!0&&o.splice(p,1);o.length>0&&r.addError("OBJECT_ADDITIONAL_PROPERTIES",[o],null,e.description)}}},dependencies:function(r,e,t){if("object"===Utils.whatIs(t))for(var i=Object.keys(e.dependencies),n=i.length;n--;){var o=i[n];if(t[o]){var a=e.dependencies[o];if("object"===Utils.whatIs(a))exports.validate.call(this,r,a,t);else for(var s=a.length;s--;){var l=a[s];void 0===t[l]&&r.addError("OBJECT_DEPENDENCY_KEY",[l,o],null,e.description)}}}},"enum":function(r,e,t){for(var i=!1,n=e["enum"].length;n--;)if(Utils.areEqual(t,e["enum"][n])){i=!0;break}i===!1&&r.addError("ENUM_MISMATCH",[t],null,e.description)},allOf:function(r,e,t){for(var i=e.allOf.length;i--&&exports.validate.call(this,r,e.allOf[i],t)!==!1;);},anyOf:function(r,e,t){for(var i=[],n=!1,o=e.anyOf.length;o--&&n===!1;){var a=new Report(r);i.push(a),n=exports.validate.call(this,a,e.anyOf[o],t)}n===!1&&r.addError("ANY_OF_MISSING",void 0,i,e.description)},oneOf:function(r,e,t){for(var i=0,n=[],o=e.oneOf.length;o--;){var a=new Report(r,{maxErrors:1});n.push(a),exports.validate.call(this,a,e.oneOf[o],t)===!0&&i++}0===i?r.addError("ONE_OF_MISSING",void 0,n,e.description):i>1&&r.addError("ONE_OF_MULTIPLE",null,null,e.description)},not:function(r,e,t){var i=new Report(r);exports.validate.call(this,i,e.not,t)===!0&&r.addError("NOT_PASSED",null,null,e.description)},definitions:function(){},format:function(r,e,t){var i=FormatValidators[e.format];"function"==typeof i?2===i.length?r.addAsyncTask(i,[t],function(i){i!==!0&&r.addError("INVALID_FORMAT",[e.format,t],null,e.description)}):i.call(this,t)!==!0&&r.addError("INVALID_FORMAT",[e.format,t],null,e.description):r.addError("UNKNOWN_FORMAT",[e.format],null,e.description)}},recurseArray=function(r,e,t){var i=t.length;if(Array.isArray(e.items))for(;i--;)i<e.items.length?(r.path.push(i.toString()),exports.validate.call(this,r,e.items[i],t[i]),r.path.pop()):"object"==typeof e.additionalItems&&(r.path.push(i.toString()),exports.validate.call(this,r,e.additionalItems,t[i]),r.path.pop());else if("object"==typeof e.items)for(;i--;)r.path.push(i.toString()),exports.validate.call(this,r,e.items,t[i]),r.path.pop()},recurseObject=function(r,e,t){var i=e.additionalProperties;(i===!0||void 0===i)&&(i={});for(var n=e.properties?Object.keys(e.properties):[],o=e.patternProperties?Object.keys(e.patternProperties):[],a=Object.keys(t),s=a.length;s--;){var l=a[s],d=t[l],p=[];-1!==n.indexOf(l)&&p.push(e.properties[l]);for(var u=o.length;u--;){var c=o[u];RegExp(c).test(l)===!0&&p.push(e.patternProperties[c])}for(0===p.length&&i!==!1&&p.push(i),u=p.length;u--;)r.path.push(l),exports.validate.call(this,r,p[u],d),r.path.pop()}};exports.validate=function(r,e,t){r.commonErrorMessage="JSON_OBJECT_VALIDATION_FAILED";var i=Utils.whatIs(e);if("object"!==i)return r.addError("SCHEMA_NOT_AN_OBJECT",[i],null,e.description),!1;var n=Object.keys(e);if(0===n.length)return!0;var o=!1;if(r.rootSchema||(r.rootSchema=e,o=!0),void 0!==e.$ref){for(var a=99;e.$ref&&a>0;){if(!e.__$refResolved){r.addError("REF_UNRESOLVED",[e.$ref],null,e.description);break}if(e.__$refResolved===e)break;e=e.__$refResolved,n=Object.keys(e),a--}if(0===a)throw new Error("Circular dependency by $ref references!")}var s=Utils.whatIs(t);if(e.type)if("string"==typeof e.type){if(s!==e.type&&("integer"!==s||"number"!==e.type)&&(r.addError("INVALID_TYPE",[e.type,s],null,e.description),this.options.breakOnFirstError))return!1}else if(-1===e.type.indexOf(s)&&("integer"!==s||-1===e.type.indexOf("number"))&&(r.addError("INVALID_TYPE",[e.type,s],null,e.description),this.options.breakOnFirstError))return!1;for(var l=n.length;l--&&!(JsonValidators[n[l]]&&(JsonValidators[n[l]].call(this,r,e,t),r.errors.length&&this.options.breakOnFirstError)););return(0===r.errors.length||this.options.breakOnFirstError===!1)&&("array"===s?recurseArray.call(this,r,e,t):"object"===s&&recurseObject.call(this,r,e,t)),o&&(r.rootSchema=void 0),0===r.errors.length};

},{"./FormatValidators":207,"./Report":210,"./Utils":214}],209:[function(require,module,exports){
"function"!=typeof Number.isFinite&&(Number.isFinite=function(e){return"number"!=typeof e?!1:e!==e||e===1/0||e===-(1/0)?!1:!0});

},{}],210:[function(require,module,exports){
(function (process){
"use strict";function Report(r,t){this.parentReport=r instanceof Report?r:void 0,this.options=r instanceof Report?r.options:r||{},this.reportOptions=t||{},this.errors=[],this.path=[],this.asyncTasks=[]}var Errors=require("./Errors"),Utils=require("./Utils");Report.prototype.isValid=function(){if(this.asyncTasks.length>0)throw new Error("Async tasks pending, can't answer isValid");return 0===this.errors.length},Report.prototype.addAsyncTask=function(r,t,o){this.asyncTasks.push([r,t,o])},Report.prototype.processAsyncTasks=function(r,t){function o(){process.nextTick(function(){var r=0===p.errors.length,o=r?void 0:p.errors;t(o,r)})}function s(r){return function(t){a||(r(t),0===--n&&o())}}var e=r||2e3,n=this.asyncTasks.length,i=n,a=!1,p=this;if(0===n||this.errors.length>0)return void o();for(;i--;){var h=this.asyncTasks[i];h[0].apply(null,h[1].concat(s(h[2])))}setTimeout(function(){n>0&&(a=!0,p.addError("ASYNC_TIMEOUT",[n,e]),t(p.errors,!1))},e)},Report.prototype.getPath=function(){var r=[];return this.parentReport&&(r=r.concat(this.parentReport.path)),r=r.concat(this.path),this.options.reportPathAsArray!==!0&&(r="#/"+r.map(function(r){return Utils.isAbsoluteUri(r)?"uri("+r+")":r.replace("~","~0").replace("/","~1")}).join("/")),r},Report.prototype.addError=function(r,t,o,s){if(!(this.errors.length>=this.reportOptions.maxErrors)){if(!r)throw new Error("No errorCode passed into addError()");if(!Errors[r])throw new Error("No errorMessage known for code "+r);t=t||[];for(var e=t.length,n=Errors[r];e--;){var i=Utils.whatIs(t[e]),a="object"===i||"null"===i?JSON.stringify(t[e]):t[e];n=n.replace("{"+e+"}",a)}var p={code:r,params:t,message:n,path:this.getPath()};if(s&&(p.description=s),null!=o){for(Array.isArray(o)||(o=[o]),p.inner=[],e=o.length;e--;)for(var h=o[e],c=h.errors.length;c--;)p.inner.push(h.errors[c]);0===p.inner.length&&(p.inner=void 0)}this.errors.push(p)}},module.exports=Report;

}).call(this,require('_process'))
},{"./Errors":206,"./Utils":214,"_process":6}],211:[function(require,module,exports){
"use strict";function decodeJSONPointer(e){return decodeURIComponent(e).replace(/~[0-1]/g,function(e){return"~1"===e?"/":"~"})}function getRemotePath(e){var t=e.indexOf("#");return-1===t?e:e.slice(0,t)}function getQueryPath(e){var t=e.indexOf("#"),r=-1===t?void 0:e.slice(t+1);return r}function findId(e,t){if("object"==typeof e&&null!==e){if(!t)return e;if(e.id&&(e.id===t||"#"===e.id[0]&&e.id.substring(1)===t))return e;var r,i;if(Array.isArray(e)){for(r=e.length;r--;)if(i=findId(e[r],t))return i}else{var a=Object.keys(e);for(r=a.length;r--;){var n=a[r];if(0!==n.indexOf("__$")&&(i=findId(e[n],t)))return i}}}}var Report=require("./Report"),SchemaCompilation=require("./SchemaCompilation"),SchemaValidation=require("./SchemaValidation"),Utils=require("./Utils");exports.cacheSchemaByUri=function(e,t){var r=getRemotePath(e);r&&(this.cache[r]=t)},exports.removeFromCacheByUri=function(e){var t=getRemotePath(e);t&&(this.cache[t]=void 0)},exports.checkCacheForUri=function(e){var t=getRemotePath(e);return t?null!=this.cache[t]:!1},exports.getSchema=function(e,t){return"object"==typeof t&&(t=exports.getSchemaByReference.call(this,e,t)),"string"==typeof t&&(t=exports.getSchemaByUri.call(this,e,t)),t},exports.getSchemaByReference=function(e,t){for(var r=this.referenceCache.length;r--;)if(this.referenceCache[r][0]===t)return this.referenceCache[r][1];var i=Utils.cloneDeep(t);return this.referenceCache.push([t,i]),i},exports.getSchemaByUri=function(e,t,r){var i=getRemotePath(t),a=getQueryPath(t),n=i?this.cache[i]:r;if(n&&i){var c=n!==r;if(c){e.path.push(i);var o=new Report(e);SchemaCompilation.compileSchema.call(this,o,n)&&SchemaValidation.validateSchema.call(this,o,n);var h=o.isValid();if(h||e.addError("REMOTE_NOT_VALID",[t],o),e.path.pop(),!h)return void 0}}if(n&&a)for(var f=a.split("/"),s=0,u=f.length;u>s;s++){var l=decodeJSONPointer(f[s]);n=0===s?findId(n,l):n[l]}return n},exports.getRemotePath=getRemotePath;

},{"./Report":210,"./SchemaCompilation":212,"./SchemaValidation":213,"./Utils":214}],212:[function(require,module,exports){
"use strict";function mergeReference(e,r){if(Utils.isAbsoluteUri(r))return r;var i,s=e.join(""),c=Utils.isAbsoluteUri(s),t=Utils.isRelativeUri(s),a=Utils.isRelativeUri(r);c&&a?(i=s.match(/\/[^\/]*$/),i&&(s=s.slice(0,i.index+1))):t&&a?s="":(i=s.match(/[^#/]+$/),i&&(s=s.slice(0,i.index)));var o=s+r;return o=o.replace(/##/,"#")}function collectReferences(e,r,i,s){if(r=r||[],i=i||[],s=s||[],"object"!=typeof e||null===e)return r;"string"==typeof e.id&&i.push(e.id),"string"==typeof e.$ref&&"undefined"==typeof e.__$refResolved&&r.push({ref:mergeReference(i,e.$ref),key:"$ref",obj:e,path:s.slice(0)}),"string"==typeof e.$schema&&"undefined"==typeof e.__$schemaResolved&&r.push({ref:mergeReference(i,e.$schema),key:"$schema",obj:e,path:s.slice(0)});var c;if(Array.isArray(e))for(c=e.length;c--;)s.push(c.toString()),collectReferences(e[c],r,i,s),s.pop();else{var t=Object.keys(e);for(c=t.length;c--;)0!==t[c].indexOf("__$")&&(s.push(t[c]),collectReferences(e[t[c]],r,i,s),s.pop())}return"string"==typeof e.id&&i.pop(),r}function findId(e,r){for(var i=e.length;i--;)if(e[i].id===r)return e[i];return null}var Report=require("./Report"),SchemaCache=require("./SchemaCache"),Utils=require("./Utils"),compileArrayOfSchemasLoop=function(e,r){for(var i=r.length,s=0;i--;){var c=new Report(e),t=exports.compileSchema.call(this,c,r[i]);t&&s++,e.errors=e.errors.concat(c.errors)}return s},compileArrayOfSchemas=function(e,r){var i,s=0;do{for(var c=e.errors.length;c--;)"UNRESOLVABLE_REFERENCE"===e.errors[c].code&&e.errors.splice(c,1);for(i=s,s=compileArrayOfSchemasLoop.call(this,e,r),c=r.length;c--;){var t=r[c];if(t.__$missingReferences){for(var a=t.__$missingReferences.length;a--;){var o=t.__$missingReferences[a],l=findId(r,o.ref);l&&(o.obj["__"+o.key+"Resolved"]=l,t.__$missingReferences.splice(a,1))}0===t.__$missingReferences.length&&delete t.__$missingReferences}}}while(s!==r.length&&s!==i);return e.isValid()};exports.compileSchema=function(e,r){if(e.commonErrorMessage="SCHEMA_COMPILATION_FAILED","string"==typeof r){var i=SchemaCache.getSchemaByUri.call(this,e,r);if(!i)return e.addError("SCHEMA_NOT_REACHABLE",[r]),!1;r=i}if(Array.isArray(r))return compileArrayOfSchemas.call(this,e,r);if(r.__$compiled&&r.id&&SchemaCache.checkCacheForUri.call(this,r.id)===!1&&(r.__$compiled=void 0),r.__$compiled)return!0;r.id&&SchemaCache.cacheSchemaByUri.call(this,r.id,r);var s=e.isValid();delete r.__$missingReferences;for(var c=collectReferences.call(this,r),t=c.length;t--;){var a=c[t],o=SchemaCache.getSchemaByUri.call(this,e,a.ref,r);if(!o){var l=this.getSchemaReader();if(l){var n=l(a.ref);if(n){n.id=a.ref;var h=new Report(e);exports.compileSchema.call(this,h,n)?o=SchemaCache.getSchemaByUri.call(this,e,a.ref,r):e.errors=e.errors.concat(h.errors)}}}if(!o){var f=Utils.isAbsoluteUri(a.ref),m=!1,p=this.options.ignoreUnresolvableReferences===!0;f&&(m=SchemaCache.checkCacheForUri.call(this,a.ref)),f&&(m||p)||(Array.prototype.push.apply(e.path,a.path),e.addError("UNRESOLVABLE_REFERENCE",[a.ref]),e.path.slice(0,-a.path.length),s&&(r.__$missingReferences=r.__$missingReferences||[],r.__$missingReferences.push(a)))}a.obj["__"+a.key+"Resolved"]=o}var _=e.isValid();return _?r.__$compiled=!0:r.id&&SchemaCache.removeFromCacheByUri.call(this,r.id),_};

},{"./Report":210,"./SchemaCache":211,"./Utils":214}],213:[function(require,module,exports){
"use strict";var FormatValidators=require("./FormatValidators"),JsonValidation=require("./JsonValidation"),Report=require("./Report"),Utils=require("./Utils"),SchemaValidators={$ref:function(e,r){"string"!=typeof r.$ref&&e.addError("KEYWORD_TYPE_EXPECTED",["$ref","string"])},$schema:function(e,r){"string"!=typeof r.$schema&&e.addError("KEYWORD_TYPE_EXPECTED",["$schema","string"])},multipleOf:function(e,r){"number"!=typeof r.multipleOf?e.addError("KEYWORD_TYPE_EXPECTED",["multipleOf","number"]):r.multipleOf<=0&&e.addError("KEYWORD_MUST_BE",["multipleOf","strictly greater than 0"])},maximum:function(e,r){"number"!=typeof r.maximum&&e.addError("KEYWORD_TYPE_EXPECTED",["maximum","number"])},exclusiveMaximum:function(e,r){"boolean"!=typeof r.exclusiveMaximum?e.addError("KEYWORD_TYPE_EXPECTED",["exclusiveMaximum","boolean"]):void 0===r.maximum&&e.addError("KEYWORD_DEPENDENCY",["exclusiveMaximum","maximum"])},minimum:function(e,r){"number"!=typeof r.minimum&&e.addError("KEYWORD_TYPE_EXPECTED",["minimum","number"])},exclusiveMinimum:function(e,r){"boolean"!=typeof r.exclusiveMinimum?e.addError("KEYWORD_TYPE_EXPECTED",["exclusiveMinimum","boolean"]):void 0===r.minimum&&e.addError("KEYWORD_DEPENDENCY",["exclusiveMinimum","minimum"])},maxLength:function(e,r){"integer"!==Utils.whatIs(r.maxLength)?e.addError("KEYWORD_TYPE_EXPECTED",["maxLength","integer"]):r.maxLength<0&&e.addError("KEYWORD_MUST_BE",["maxLength","greater than, or equal to 0"])},minLength:function(e,r){"integer"!==Utils.whatIs(r.minLength)?e.addError("KEYWORD_TYPE_EXPECTED",["minLength","integer"]):r.minLength<0&&e.addError("KEYWORD_MUST_BE",["minLength","greater than, or equal to 0"])},pattern:function(e,r){if("string"!=typeof r.pattern)e.addError("KEYWORD_TYPE_EXPECTED",["pattern","string"]);else try{RegExp(r.pattern)}catch(t){e.addError("KEYWORD_PATTERN",["pattern",r.pattern])}},additionalItems:function(e,r){var t=Utils.whatIs(r.additionalItems);"boolean"!==t&&"object"!==t?e.addError("KEYWORD_TYPE_EXPECTED",["additionalItems",["boolean","object"]]):"object"===t&&(e.path.push("additionalItems"),exports.validateSchema.call(this,e,r.additionalItems),e.path.pop())},items:function(e,r){var t=Utils.whatIs(r.items);if("object"===t)e.path.push("items"),exports.validateSchema.call(this,e,r.items),e.path.pop();else if("array"===t)for(var a=r.items.length;a--;)e.path.push("items"),e.path.push(a.toString()),exports.validateSchema.call(this,e,r.items[a]),e.path.pop(),e.path.pop();else e.addError("KEYWORD_TYPE_EXPECTED",["items",["array","object"]]);this.options.forceAdditional===!0&&void 0===r.additionalItems&&Array.isArray(r.items)&&e.addError("KEYWORD_UNDEFINED_STRICT",["additionalItems"]),this.options.assumeAdditional===!0&&void 0===r.additionalItems&&Array.isArray(r.items)&&(r.additionalItems=!1)},maxItems:function(e,r){"number"!=typeof r.maxItems?e.addError("KEYWORD_TYPE_EXPECTED",["maxItems","integer"]):r.maxItems<0&&e.addError("KEYWORD_MUST_BE",["maxItems","greater than, or equal to 0"])},minItems:function(e,r){"integer"!==Utils.whatIs(r.minItems)?e.addError("KEYWORD_TYPE_EXPECTED",["minItems","integer"]):r.minItems<0&&e.addError("KEYWORD_MUST_BE",["minItems","greater than, or equal to 0"])},uniqueItems:function(e,r){"boolean"!=typeof r.uniqueItems&&e.addError("KEYWORD_TYPE_EXPECTED",["uniqueItems","boolean"])},maxProperties:function(e,r){"integer"!==Utils.whatIs(r.maxProperties)?e.addError("KEYWORD_TYPE_EXPECTED",["maxProperties","integer"]):r.maxProperties<0&&e.addError("KEYWORD_MUST_BE",["maxProperties","greater than, or equal to 0"])},minProperties:function(e,r){"integer"!==Utils.whatIs(r.minProperties)?e.addError("KEYWORD_TYPE_EXPECTED",["minProperties","integer"]):r.minProperties<0&&e.addError("KEYWORD_MUST_BE",["minProperties","greater than, or equal to 0"])},required:function(e,r){if("array"!==Utils.whatIs(r.required))e.addError("KEYWORD_TYPE_EXPECTED",["required","array"]);else if(0===r.required.length)e.addError("KEYWORD_MUST_BE",["required","an array with at least one element"]);else{for(var t=r.required.length;t--;)"string"!=typeof r.required[t]&&e.addError("KEYWORD_VALUE_TYPE",["required","string"]);Utils.isUniqueArray(r.required)===!1&&e.addError("KEYWORD_MUST_BE",["required","an array with unique items"])}},additionalProperties:function(e,r){var t=Utils.whatIs(r.additionalProperties);"boolean"!==t&&"object"!==t?e.addError("KEYWORD_TYPE_EXPECTED",["additionalProperties",["boolean","object"]]):"object"===t&&(e.path.push("additionalProperties"),exports.validateSchema.call(this,e,r.additionalProperties),e.path.pop())},properties:function(e,r){if("object"!==Utils.whatIs(r.properties))return void e.addError("KEYWORD_TYPE_EXPECTED",["properties","object"]);for(var t=Object.keys(r.properties),a=t.length;a--;){var i=t[a],o=r.properties[i];e.path.push("properties"),e.path.push(i),exports.validateSchema.call(this,e,o),e.path.pop(),e.path.pop()}this.options.forceAdditional===!0&&void 0===r.additionalProperties&&e.addError("KEYWORD_UNDEFINED_STRICT",["additionalProperties"]),this.options.assumeAdditional===!0&&void 0===r.additionalProperties&&(r.additionalProperties=!1),this.options.forceProperties===!0&&0===t.length&&e.addError("CUSTOM_MODE_FORCE_PROPERTIES",["properties"])},patternProperties:function(e,r){if("object"!==Utils.whatIs(r.patternProperties))return void e.addError("KEYWORD_TYPE_EXPECTED",["patternProperties","object"]);for(var t=Object.keys(r.patternProperties),a=t.length;a--;){var i=t[a],o=r.patternProperties[i];try{RegExp(i)}catch(n){e.addError("KEYWORD_PATTERN",["patternProperties",i])}e.path.push("patternProperties"),e.path.push(i.toString()),exports.validateSchema.call(this,e,o),e.path.pop(),e.path.pop()}this.options.forceProperties===!0&&0===t.length&&e.addError("CUSTOM_MODE_FORCE_PROPERTIES",["patternProperties"])},dependencies:function(e,r){if("object"!==Utils.whatIs(r.dependencies))e.addError("KEYWORD_TYPE_EXPECTED",["dependencies","object"]);else for(var t=Object.keys(r.dependencies),a=t.length;a--;){var i=t[a],o=r.dependencies[i],n=Utils.whatIs(o);if("object"===n)e.path.push("dependencies"),e.path.push(i),exports.validateSchema.call(this,e,o),e.path.pop(),e.path.pop();else if("array"===n){var E=o.length;for(0===E&&e.addError("KEYWORD_MUST_BE",["dependencies","not empty array"]);E--;)"string"!=typeof o[E]&&e.addError("KEYWORD_VALUE_TYPE",["dependensices","string"]);Utils.isUniqueArray(o)===!1&&e.addError("KEYWORD_MUST_BE",["dependencies","an array with unique items"])}else e.addError("KEYWORD_VALUE_TYPE",["dependencies","object or array"])}},"enum":function(e,r){Array.isArray(r["enum"])===!1?e.addError("KEYWORD_TYPE_EXPECTED",["enum","array"]):0===r["enum"].length?e.addError("KEYWORD_MUST_BE",["enum","an array with at least one element"]):Utils.isUniqueArray(r["enum"])===!1&&e.addError("KEYWORD_MUST_BE",["enum","an array with unique elements"])},type:function(e,r){var t=["array","boolean","integer","number","null","object","string"],a=t.join(","),i=Array.isArray(r.type);if(i){for(var o=r.type.length;o--;)-1===t.indexOf(r.type[o])&&e.addError("KEYWORD_TYPE_EXPECTED",["type",a]);Utils.isUniqueArray(r.type)===!1&&e.addError("KEYWORD_MUST_BE",["type","an object with unique properties"])}else"string"==typeof r.type?-1===t.indexOf(r.type)&&e.addError("KEYWORD_TYPE_EXPECTED",["type",a]):e.addError("KEYWORD_TYPE_EXPECTED",["type",["string","array"]]);this.options.noEmptyStrings===!0&&("string"===r.type||i&&-1!==r.type.indexOf("string"))&&void 0===r.minLength&&void 0===r["enum"]&&void 0===r.format&&(r.minLength=1),this.options.noEmptyArrays===!0&&("array"===r.type||i&&-1!==r.type.indexOf("array"))&&void 0===r.minItems&&(r.minItems=1),this.options.forceProperties===!0&&("object"===r.type||i&&-1!==r.type.indexOf("object"))&&void 0===r.properties&&void 0===r.patternProperties&&e.addError("KEYWORD_UNDEFINED_STRICT",["properties"]),this.options.forceItems===!0&&("array"===r.type||i&&-1!==r.type.indexOf("array"))&&void 0===r.items&&e.addError("KEYWORD_UNDEFINED_STRICT",["items"]),this.options.forceMinItems===!0&&("array"===r.type||i&&-1!==r.type.indexOf("array"))&&void 0===r.minItems&&e.addError("KEYWORD_UNDEFINED_STRICT",["minItems"]),this.options.forceMaxItems===!0&&("array"===r.type||i&&-1!==r.type.indexOf("array"))&&void 0===r.maxItems&&e.addError("KEYWORD_UNDEFINED_STRICT",["maxItems"]),this.options.forceMinLength===!0&&("string"===r.type||i&&-1!==r.type.indexOf("string"))&&void 0===r.minLength&&void 0===r.format&&void 0===r["enum"]&&void 0===r.pattern&&e.addError("KEYWORD_UNDEFINED_STRICT",["minLength"]),this.options.forceMaxLength===!0&&("string"===r.type||i&&-1!==r.type.indexOf("string"))&&void 0===r.maxLength&&void 0===r.format&&void 0===r["enum"]&&void 0===r.pattern&&e.addError("KEYWORD_UNDEFINED_STRICT",["maxLength"])},allOf:function(e,r){if(Array.isArray(r.allOf)===!1)e.addError("KEYWORD_TYPE_EXPECTED",["allOf","array"]);else if(0===r.allOf.length)e.addError("KEYWORD_MUST_BE",["allOf","an array with at least one element"]);else for(var t=r.allOf.length;t--;)e.path.push("allOf"),e.path.push(t.toString()),exports.validateSchema.call(this,e,r.allOf[t]),e.path.pop(),e.path.pop()},anyOf:function(e,r){if(Array.isArray(r.anyOf)===!1)e.addError("KEYWORD_TYPE_EXPECTED",["anyOf","array"]);else if(0===r.anyOf.length)e.addError("KEYWORD_MUST_BE",["anyOf","an array with at least one element"]);else for(var t=r.anyOf.length;t--;)e.path.push("anyOf"),e.path.push(t.toString()),exports.validateSchema.call(this,e,r.anyOf[t]),e.path.pop(),e.path.pop()},oneOf:function(e,r){if(Array.isArray(r.oneOf)===!1)e.addError("KEYWORD_TYPE_EXPECTED",["oneOf","array"]);else if(0===r.oneOf.length)e.addError("KEYWORD_MUST_BE",["oneOf","an array with at least one element"]);else for(var t=r.oneOf.length;t--;)e.path.push("oneOf"),e.path.push(t.toString()),exports.validateSchema.call(this,e,r.oneOf[t]),e.path.pop(),e.path.pop()},not:function(e,r){"object"!==Utils.whatIs(r.not)?e.addError("KEYWORD_TYPE_EXPECTED",["not","object"]):(e.path.push("not"),exports.validateSchema.call(this,e,r.not),e.path.pop())},definitions:function(e,r){if("object"!==Utils.whatIs(r.definitions))e.addError("KEYWORD_TYPE_EXPECTED",["definitions","object"]);else for(var t=Object.keys(r.definitions),a=t.length;a--;){var i=t[a],o=r.definitions[i];e.path.push("definitions"),e.path.push(i),exports.validateSchema.call(this,e,o),e.path.pop(),e.path.pop()}},format:function(e,r){"string"!=typeof r.format?e.addError("KEYWORD_TYPE_EXPECTED",["format","string"]):void 0===FormatValidators[r.format]&&e.addError("UNKNOWN_FORMAT",[r.format])},id:function(e,r){"string"!=typeof r.id&&e.addError("KEYWORD_TYPE_EXPECTED",["id","string"])},title:function(e,r){"string"!=typeof r.title&&e.addError("KEYWORD_TYPE_EXPECTED",["title","string"])},description:function(e,r){"string"!=typeof r.description&&e.addError("KEYWORD_TYPE_EXPECTED",["description","string"])},"default":function(){}},validateArrayOfSchemas=function(e,r){for(var t=r.length;t--;)exports.validateSchema.call(this,e,r[t]);return e.isValid()};exports.validateSchema=function(e,r){if(e.commonErrorMessage="SCHEMA_VALIDATION_FAILED",Array.isArray(r))return validateArrayOfSchemas.call(this,e,r);if(r.__$validated)return!0;var t=r.$schema&&r.id!==r.$schema;if(t)if(r.__$schemaResolved&&r.__$schemaResolved!==r){var a=new Report(e),i=JsonValidation.validate.call(this,a,r.__$schemaResolved,r);i===!1&&e.addError("PARENT_SCHEMA_VALIDATION_FAILED",null,a)}else this.options.ignoreUnresolvableReferences!==!0&&e.addError("REF_UNRESOLVED",[r.$schema]);if(this.options.noTypeless===!0){if(void 0!==r.type){var o=[];Array.isArray(r.anyOf)&&(o=o.concat(r.anyOf)),Array.isArray(r.oneOf)&&(o=o.concat(r.oneOf)),Array.isArray(r.allOf)&&(o=o.concat(r.allOf)),o.forEach(function(e){e.type||(e.type=r.type)})}void 0===r["enum"]&&void 0===r.type&&void 0===r.anyOf&&void 0===r.oneOf&&void 0===r.not&&void 0===r.$ref&&e.addError("KEYWORD_UNDEFINED_STRICT",["type"])}for(var n=Object.keys(r),E=n.length;E--;){var s=n[E];0!==s.indexOf("__")&&(void 0!==SchemaValidators[s]?SchemaValidators[s].call(this,e,r):t||this.options.noExtraKeywords===!0&&e.addError("KEYWORD_UNEXPECTED",[s]))}if(this.options.pedanticCheck===!0){if(r["enum"]){var d=Utils.clone(r);for(delete d["enum"],delete d["default"],e.path.push("enum"),E=r["enum"].length;E--;)e.path.push(E.toString()),JsonValidation.validate.call(this,e,d,r["enum"][E]),e.path.pop();e.path.pop()}r["default"]&&(e.path.push("default"),JsonValidation.validate.call(this,e,r,r["default"]),e.path.pop())}var p=e.isValid();return p&&(r.__$validated=!0),p};

},{"./FormatValidators":207,"./JsonValidation":208,"./Report":210,"./Utils":214}],214:[function(require,module,exports){
"use strict";exports.isAbsoluteUri=function(r){return/^https?:\/\//.test(r)},exports.isRelativeUri=function(r){return/.+#/.test(r)},exports.whatIs=function(r){var e=typeof r;return"object"===e?null===r?"null":Array.isArray(r)?"array":"object":"number"===e?Number.isFinite(r)?r%1===0?"integer":"number":Number.isNaN(r)?"not-a-number":"unknown-number":e},exports.areEqual=function r(e,t){if(e===t)return!0;var n,u;if(Array.isArray(e)&&Array.isArray(t)){if(e.length!==t.length)return!1;for(u=e.length,n=0;u>n;n++)if(!r(e[n],t[n]))return!1;return!0}if("object"===exports.whatIs(e)&&"object"===exports.whatIs(t)){var o=Object.keys(e),s=Object.keys(t);if(!r(o,s))return!1;for(u=o.length,n=0;u>n;n++)if(!r(e[o[n]],t[o[n]]))return!1;return!0}return!1},exports.isUniqueArray=function(r,e){var t,n,u=r.length;for(t=0;u>t;t++)for(n=t+1;u>n;n++)if(exports.areEqual(r[t],r[n]))return e&&e.push(t,n),!1;return!0},exports.difference=function(r,e){for(var t=[],n=r.length;n--;)-1===e.indexOf(r[n])&&t.push(r[n]);return t},exports.clone=function(r){if("object"!=typeof r||null===r)return r;var e,t;if(Array.isArray(r))for(e=[],t=r.length;t--;)e[t]=r[t];else{e={};var n=Object.keys(r);for(t=n.length;t--;){var u=n[t];e[u]=r[u]}}return e},exports.cloneDeep=function(r){function e(r){if("object"!=typeof r||null===r)return r;var u,o,s;if(s=t.indexOf(r),-1!==s)return n[s];if(t.push(r),Array.isArray(r))for(u=[],n.push(u),o=r.length;o--;)u[o]=e(r[o]);else{u={},n.push(u);var i=Object.keys(r);for(o=i.length;o--;){var f=i[o];u[f]=e(r[f])}}return u}var t=[],n=[];return e(r)},exports.ucs2decode=function(r){for(var e,t,n=[],u=0,o=r.length;o>u;)e=r.charCodeAt(u++),e>=55296&&56319>=e&&o>u?(t=r.charCodeAt(u++),56320==(64512&t)?n.push(((1023&e)<<10)+(1023&t)+65536):(n.push(e),u--)):n.push(e);return n};

},{}],215:[function(require,module,exports){
(function (process){
"use strict";function ZSchema(e){if(this.cache={},this.referenceCache=[],this.setRemoteReference("http://json-schema.org/draft-04/schema",Draft4Schema),this.setRemoteReference("http://json-schema.org/draft-04/hyper-schema",Draft4HyperSchema),"object"==typeof e){for(var t=Object.keys(e),r=t.length;r--;){var a=t[r];if(void 0===defaultOptions[a])throw new Error("Unexpected option passed to constructor: "+a)}this.options=e}else this.options=Utils.clone(defaultOptions);this.options.strictMode===!0&&(this.options.forceAdditional=!0,this.options.forceItems=!0,this.options.forceMaxLength=!0,this.options.forceProperties=!0,this.options.noExtraKeywords=!0,this.options.noTypeless=!0,this.options.noEmptyStrings=!0,this.options.noEmptyArrays=!0)}require("./Polyfills");var Report=require("./Report"),FormatValidators=require("./FormatValidators"),JsonValidation=require("./JsonValidation"),SchemaCache=require("./SchemaCache"),SchemaCompilation=require("./SchemaCompilation"),SchemaValidation=require("./SchemaValidation"),Utils=require("./Utils"),Draft4Schema=require("./schemas/schema.json"),Draft4HyperSchema=require("./schemas/hyper-schema.json"),defaultOptions={asyncTimeout:2e3,forceAdditional:!1,assumeAdditional:!1,forceItems:!1,forceMinItems:!1,forceMaxItems:!1,forceMinLength:!1,forceMaxLength:!1,forceProperties:!1,ignoreUnresolvableReferences:!1,noExtraKeywords:!1,noTypeless:!1,noEmptyStrings:!1,noEmptyArrays:!1,strictUris:!1,strictMode:!1,reportPathAsArray:!1,breakOnFirstError:!0,pedanticCheck:!1};ZSchema.prototype.compileSchema=function(e){var t=new Report(this.options);return e=SchemaCache.getSchema.call(this,t,e),SchemaCompilation.compileSchema.call(this,t,e),this.lastReport=t,t.isValid()},ZSchema.prototype.validateSchema=function(e){if(Array.isArray(e)&&0===e.length)throw new Error(".validateSchema was called with an empty array");var t=new Report(this.options);e=SchemaCache.getSchema.call(this,t,e);var r=SchemaCompilation.compileSchema.call(this,t,e);return r&&SchemaValidation.validateSchema.call(this,t,e),this.lastReport=t,t.isValid()},ZSchema.prototype.validate=function(e,t,r){var a=Utils.whatIs(t);if("string"!==a&&"object"!==a){var o=new Error("Invalid .validate call - schema must be an string or object but "+a+" was passed!");if(r)return void process.nextTick(function(){r(o,!1)});throw o}var s=!1,i=new Report(this.options);t=SchemaCache.getSchema.call(this,i,t);var n=!1;s||(n=SchemaCompilation.compileSchema.call(this,i,t)),n||(this.lastReport=i,s=!0);var c=!1;if(s||(c=SchemaValidation.validateSchema.call(this,i,t)),c||(this.lastReport=i,s=!0),s||JsonValidation.validate.call(this,i,t,e),r)return void i.processAsyncTasks(this.options.asyncTimeout,r);if(i.asyncTasks.length>0)throw new Error("This validation has async tasks and cannot be done in sync mode, please provide callback argument.");return this.lastReport=i,i.isValid()},ZSchema.prototype.getLastError=function(){if(0===this.lastReport.errors.length)return null;var e=new Error;return e.name="z-schema validation error",e.message=this.lastReport.commonErrorMessage,e.details=this.lastReport.errors,e},ZSchema.prototype.getLastErrors=function(){return this.lastReport.errors.length>0?this.lastReport.errors:void 0},ZSchema.prototype.getMissingReferences=function(){for(var e=[],t=this.lastReport.errors.length;t--;){var r=this.lastReport.errors[t];if("UNRESOLVABLE_REFERENCE"===r.code){var a=r.params[0];-1===e.indexOf(a)&&e.push(a)}}return e},ZSchema.prototype.getMissingRemoteReferences=function(){for(var e=this.getMissingReferences(),t=[],r=e.length;r--;){var a=SchemaCache.getRemotePath(e[r]);a&&-1===t.indexOf(a)&&t.push(a)}return t},ZSchema.prototype.setRemoteReference=function(e,t){"string"==typeof t&&(t=JSON.parse(t)),SchemaCache.cacheSchemaByUri.call(this,e,t)},ZSchema.prototype.getResolvedSchema=function(e){var t=new Report(this.options);e=SchemaCache.getSchema.call(this,t,e),e=Utils.cloneDeep(e);var r=[],a=function(e){var t,o=Utils.whatIs(e);if(("object"===o||"array"===o)&&!e.___$visited){if(e.___$visited=!0,r.push(e),e.$ref&&e.__$refResolved){var s=e.__$refResolved,i=e;delete e.$ref,delete e.__$refResolved;for(t in s)s.hasOwnProperty(t)&&(i[t]=s[t])}for(t in e)e.hasOwnProperty(t)&&(0===t.indexOf("__$")?delete e[t]:a(e[t]))}};if(a(e),r.forEach(function(e){delete e.___$visited}),this.lastReport=t,t.isValid())return e;throw this.getLastError()},ZSchema.prototype.setSchemaReader=function(e){return ZSchema.setSchemaReader(e)},ZSchema.prototype.getSchemaReader=function(){return ZSchema.schemaReader},ZSchema.setSchemaReader=function(e){ZSchema.schemaReader=e},ZSchema.registerFormat=function(e,t){FormatValidators[e]=t},ZSchema.getRegisteredFormats=function(){return Object.keys(FormatValidators)},ZSchema.getDefaultOptions=function(){return Utils.cloneDeep(defaultOptions)},module.exports=ZSchema;

}).call(this,require('_process'))
},{"./FormatValidators":207,"./JsonValidation":208,"./Polyfills":209,"./Report":210,"./SchemaCache":211,"./SchemaCompilation":212,"./SchemaValidation":213,"./Utils":214,"./schemas/hyper-schema.json":216,"./schemas/schema.json":217,"_process":6}],216:[function(require,module,exports){
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


},{}],217:[function(require,module,exports){
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

},{}],218:[function(require,module,exports){
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

},{}],219:[function(require,module,exports){
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


},{}],220:[function(require,module,exports){
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
},{}],221:[function(require,module,exports){
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

},{}],222:[function(require,module,exports){
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
},{}],223:[function(require,module,exports){
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


},{}],224:[function(require,module,exports){
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
},{}],225:[function(require,module,exports){
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

},{}],226:[function(require,module,exports){
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

},{}],227:[function(require,module,exports){
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

},{}],228:[function(require,module,exports){
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
},{}],229:[function(require,module,exports){
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
},{}],230:[function(require,module,exports){
arguments[4][217][0].apply(exports,arguments)
},{"dup":217}]},{},[2])(2)
});