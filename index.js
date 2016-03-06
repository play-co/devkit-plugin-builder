'use strict';

let path = require('path');

let lazy = require('lazy-cache')(require);
lazy('mkdirp');
lazy('bluebird', 'Promise');
lazy('merge');

let JsioBuilder = require('./builders/JsioBuilder');
let GenericBuilder = require('./builders/GenericBuilder');

let logging = require('./logging');
let logger = logging.get('moduleCompiler');


module.exports = {
  builders: {
    jsio: JsioBuilder,
    generic: GenericBuilder
  },

  opts: {
    livereload: true
  },

  updateOpts: function(opts) {
    logger.info('Updating opts:', opts);
    lazy.merge(this.opts, opts);
  },

  load: function(modulePath) {
    logger.info('Loading module at:', modulePath);
    try {
      let modulePackage = require(path.join(modulePath, 'package.json'));
      // Get all the main files and compile them
      if (!modulePackage.devkit || !modulePackage.devkit.pluginBuilder) {
        logger.warn('module did not specify a devkit.pluginBuilder');
        return;
      }
      return modulePackage;
    } catch(e) {
      throw new Error('module contains no package.json');
    }
  },

  checkBuilder: function(modulePath, modulePackage, builderName, pluginBuilders) {
    let builderMap = modulePackage.devkit.pluginBuilder[builderName];
    if (!builderMap) {
      return;
    }

    for (let i = 0; i < builderMap.length; i++) {
      let builderInfo = builderMap[i];
      let builder = new this.builders[builderName](this, {
        modulePath: modulePath,
        modulePackage: modulePackage,

        builderInfo: builderInfo
      });
      pluginBuilders.push(builder);
    }
  },

  executeRunnerTask: function(modulePath, taskName, cb) {
    modulePath = path.resolve(modulePath);
    let modulePackage = this.load(modulePath);
    if (!modulePackage) {
      cb && cb();
      return;
    }

    let moduleName = modulePackage.name;
    logger.info('Running task "' + taskName + '" on module: ' + moduleName);

    // Special case compile
    if (taskName === 'compile') {
      lazy.mkdirp.sync(path.join(modulePath, 'build'));
    }

    let pluginBuilders = [];
    Object.keys(this.builders).forEach(function(builderName) {
      this.checkBuilder(modulePath, modulePackage, builderName, pluginBuilders);
    }.bind(this));

    let tasks = [];
    pluginBuilders.forEach(builder => {
      builder[taskName](tasks);
    });

    lazy.Promise.all(tasks)
      .then(() => {
        logger.info('Done!');
        cb && cb();
      })
      .catch(e => {
        logger.error(e.stack || e);
        cb && cb(e);
      });
  }
};
