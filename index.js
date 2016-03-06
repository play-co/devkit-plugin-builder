var path = require('path');

var lazy = require('lazy-cache')(require);
lazy('mkdirp');
lazy('bluebird', 'Promise');
lazy('merge');

var JsioBuilder = require('./builders/JsioBuilder');
var GenericBuilder = require('./builders/GenericBuilder');

var logging = require('./logging');
var logger = logging.get('moduleCompiler');


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

  checkBuilder: function(modulePath, modulePackage, builderName, pluginBuilders) {
    var builderMap = modulePackage.devkit.pluginBuilder[builderName];
    if (!builderMap) {
      return;
    }

    for (var i = 0; i < builderMap.length; i++) {
      var builderInfo = builderMap[i];
      var builder = new this.builders[builderName](this, {
        modulePath: modulePath,
        modulePackage: modulePackage,

        builderInfo: builderInfo
      });
      pluginBuilders.push(builder);
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
      lazy.mkdirp.sync(path.join(modulePath, 'build'));
    }

    var pluginBuilders = [];
    Object.keys(this.builders).forEach(function(builderName) {
      this.checkBuilder(modulePath, modulePackage, builderName, pluginBuilders);
    }.bind(this));

    var tasks = [];
    pluginBuilders.forEach(function(builder) {
      builder[taskName](tasks);
    });

    lazy.Promise.all(tasks)
      .then(function() {
        logger.info('Done!');
        cb && cb();
      })
      .catch(function(e) {
        logger.error(e);
        cb && cb(e);
      });
  }
};
