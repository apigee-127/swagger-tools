'use strict';

var requestProgress = require('request-progress');
var progress = require('progress');
var extractZip = require('extract-zip');
var fs = require('fs-extra');
var path = require('path');
var request = require('request');
var os = require('os');

var targetPath = path.join(__dirname, 'middleware', 'swagger-ui');

download(function(err, filePath){
  if(err) { return console.log(err); }
  extractDownload(filePath, function(err, extractedPath) {
    if(err) { return console.log(err); }
    copyIntoPlace(extractedPath, targetPath, function(err){
      if(err) { return console.log(err); }
    });
  });
});

function getTempDirectory() {
  var now = Date.now();
  var candidateTmpDirs = [
    process.env.npm_config_tmp,
    os.tmpdir(),
    path.join(process.cwd(), 'tmp')
  ];

  for (var i = 0; i < candidateTmpDirs.length; i++) {
    var candidatePath = candidateTmpDirs[i];
    if (!candidatePath) continue;

    try {
      candidatePath = path.join(path.resolve(candidatePath), 'swagger-ui');
      fs.mkdirsSync(candidatePath, '0777');
      // Make double sure we have 0777 permissions; some operating systems
      // default umask does not allow write by default.
      fs.chmodSync(candidatePath, '0777');
      var testFile = path.join(candidatePath, now + '.tmp');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      return candidatePath;
    } catch (e) {
      console.log(candidatePath, 'is not writable:', e.message);
    }
  }

  console.error('Can not find a writable tmp directory');
  process.exit(1);
}

function extractDownload(filePath, cb) {
  // extract to a unique directory in case multiple processes are
  // installing and extracting at once
  var extractedPath = filePath + '-extract-' + Date.now();

  fs.mkdirsSync(extractedPath, '0777');
  fs.chmodSync(extractedPath, '0777'); // be sure

  console.log('Extracting zip contents');
  extractZip(path.resolve(filePath), {dir: extractedPath}, function(err) {
    if (err) {
      console.error('Error extracting zip');
      return process.exit(1);
    }

    cb(null, extractedPath);
  });
}

function copyIntoPlace(extractedPath, targetPath, cb) {
  console.log('Removing', targetPath);
  fs.remove(targetPath, function (err) {
    if(err) {
      return cb(err);
    }
    // Look for the extracted directory, so we can rename it.
    var files = fs.readdirSync(extractedPath);
    for (var i = 0; i < files.length; i++) {
      var file = path.join(extractedPath, files[i]);
      console.log(file);
      if (fs.statSync(file).isDirectory()) {
        console.log('Copying extracted folder', file+'/dist', '->', targetPath);
        return fs.move(file+'/dist', targetPath, cb);
      }
    }

    console.log('Could not find extracted file', files);
    process.exit(1);
  });
}

function downloadArchive(requestOptions, filePath, cb) {
  var writePath = filePath + '-download-' + Date.now();

  var bar = null;
  requestProgress(request(requestOptions, function (error, response, body) {
    console.log('');
    if (!error && response.statusCode === 200) {
      fs.writeFileSync(writePath, body);
      console.log('Received ' + Math.floor(body.length / 1024) + 'K total.');
      fs.renameSync(writePath, filePath);
      cb(null, filePath);

    } else if (response) {
      console.error('Error requesting archive.\n' +
          'Status: ' + response.statusCode + '\n' +
          'Request options: ' + JSON.stringify(requestOptions, null, 2) + '\n' +
          'Response headers: ' + JSON.stringify(response.headers, null, 2));
      process.exit(1);
    } else {
      console.log('Error requesting archive.\n Couldn\'t connect to download server');
      process.exit(1);
    }
  })).on('progress', function (state) {
    try {
      if (!bar) {
        bar = new progress('  [:bar] :percent', {total: state.size.total, width: 40});
      }
      bar.curr = state.size.transferred;
      bar.tick();
    } catch (e) {
      // It doesn't really matter if the progress bar doesn't update.
    }
  })
  .on('error', function(){
    console.log('Error requesting archive.');
  });
}

function download(cb) {
  var downloadUrl = "https://github.com/swagger-api/swagger-ui/archive/v2.1.4.zip";
  var checksum = "";
  var tmpPath = getTempDirectory();
  var fileName = downloadUrl.split('/').pop();
  var downloadedFile = path.join(tmpPath, fileName);

  if (fs.existsSync(downloadedFile)) {
    console.log('Download already available at', downloadedFile);
    return cb(null, downloadedFile);
  }

  var options = {
    uri: downloadUrl,
    encoding: null,
    followRedirect: true,
    headers: {},
    strictSSL: true
  };

  var proxyUrl = process.env.npm_config_https_proxy ||
      process.env.npm_config_http_proxy ||
      process.env.npm_config_proxy;

  if (proxyUrl) {
    console.log('Using proxy');
    options.proxy = proxyUrl;
  }

  console.log('Downloading', downloadUrl);
  console.log('Saving to', downloadedFile);
  downloadArchive(options, downloadedFile, cb);
}