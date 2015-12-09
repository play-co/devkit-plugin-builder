var path = require('path');
var mkdirp = require('mkdirp');
var Promise = require('bluebird');

var JsioBuilder = require('./builders/JsioBuilder');
var GenericBuilder = require('./builders/GenericBuilder');

var logging = require('./logging');
var logger = logging.get('moduleCompiler');


module.exports = {
  builders: {
    jsio: JsioBuilder,
    generic: GenericBuilder
  },

  load: function(modulePath) {
    logger.info('Loading module at:', modulePath);
    try {
      var modulePackage = require(path.join(modulePath, 'package.json'));
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

  executeRunnerTask: function(modulePath, taskName, cb) {
    modulePath = path.resolve(modulePath);
    var modulePackage = this.load(modulePath);
    if (!modulePackage) {
      cb && cb();
      return;
    }

    var moduleName = modulePackage.name;
    logger.info('Running task "' + taskName + '" on module: ' + moduleName);

    // Special case compile
    if (taskName === 'compile') {
      mkdirp.sync(path.join(modulePath, 'build'));
    }

    var pluginBuilders = [];
    Object.keys(this.builders).forEach(function(builderName) {
      this.checkBuilder(modulePath, modulePackage, builderName, pluginBuilders);
    }.bind(this));

    var tasks = [];
    pluginBuilders.forEach(function(builder) {
      builder[taskName](tasks);
    });

    Promise.all(tasks)
      .then(function() {
        logger.info('Done!');
        cb && cb();
      })
      .catch(function(e) {
        logger.error(e);
        cb && cb(e);
      });
  },

  checkBuilder: function(modulePath, modulePackage, builderName, pluginBuilders) {
    var builderMap = modulePackage.devkit.pluginBuilder[builderName];
    if (!builderMap) {
      return;
    }

    for (var i = 0; i < builderMap.length; i++) {
      var builderInfo = builderMap[i];
      var builder = new this.builders[builderName]({
        modulePath: modulePath,
        modulePackage: modulePackage,

        builderInfo: builderInfo
      });
      pluginBuilders.push(builder);
    }
  }

};
