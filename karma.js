const { Server: KarmaServer } = require('karma');
const path = require('path');

const karmaTest = async configFile => {
  await new Promise((resolve, reject) =>
    new KarmaServer(
      {
        configFile,
        singleRun: true,
      },
      err => {
        if (err) {
          return reject(err);
        }
        return resolve();
      }
    ).start());
};

const standalone = 'standalone';
const cf = path.join(
  __dirname,
  'test/browser/karma-' +
  (standalone ? 'standalone' : 'bower') +
  '.conf.js'
);
karmaTest(cf)