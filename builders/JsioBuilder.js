var path = require('path');
var fs = require('fs');

var gulp = require('gulp');
var plugins = require('gulp-load-plugins')();

var lazy = require('lazy-cache')(require);
lazy('nib');
lazy('uglify-js', 'UglifyJS');
lazy('resolve');
lazy('bluebird', 'Promise');

var Builder = require('./Builder');
var logging = require('../logging');


module.exports = Class({
  inherits: Builder,

  init: function constructor(pluginBuilder, opts) {
    constructor.super.call(this, pluginBuilder, opts);

    this.paths = {
      base: path.join(__dirname, '..', '..'),
      stylusMain: path.join(this.srcPath, 'stylus', 'main.styl')
    };

    // lookup squill and jsio dynamically, prefer a version found in the module
    // in case the module uses a specific version of squill/jsio
    try {
      var squillPath = path.dirname(lazy.resolve.sync('squill/Widget', {basedir: this.modulePath}));
      this.paths.squill = squillPath;
    } catch (e) {
      // squill not found in module
    }

    var jsioPath;
    try {
      jsioPath = path.dirname(lazy.resolve.sync('jsio', {basedir: this.modulePath}));
    } catch (e) {
      jsioPath = path.dirname(lazy.resolve.sync('jsio'));
    }
    this.paths.jsio = jsioPath;

    this.logger = logging.get('JsioBuilder.' + this.moduleName + '.' + this.src);

    this.compress = false;
    this.sourcemaps = false;

    this.promiseBuildStylus = lazy.Promise.promisify(this._buildStylus.bind(this));
    this.promiseBuildJS = lazy.Promise.promisify(this._buildJS.bind(this));
  },


  _buildStylus: function (stylusMainPath, cb) {
    this.logger.info('Compiling stylus for ' + this.moduleName + ': ' + stylusMainPath);

    var stream = gulp.src(stylusMainPath)
      .pipe(plugins.stylus({
        use: lazy.nib(),
        sourcemap: this.sourcemaps,
        compress: this.compress
      }))
      .pipe(plugins.concat('index.css'))
      .pipe(gulp.dest(this.buildPath));

    stream.on('end', function() {
      cb();
    });
    stream.on('error', function(err) {
      cb(err);
    });
  },


  _buildJS: function (cb) {
    var moduleMain = this.src;
    var buildPath = this.buildPath;
    var jsPath = this.srcPath;
    var basePath = path.dirname(jsPath);

    var logger = this.logger;
    logger.info('Compiling jsMain for ' + this.moduleName + ': ' + moduleMain);
    logger.debug('jsio path:', this.paths.jsio);
    logger.debug('module jsPath:', jsPath);

    var jsio = require('jsio');
    var compilerPath = path.join(jsio.__env.getPath(), '..', 'compilers');
    jsio.path.add(compilerPath);

    var compiler = jsio('import jsio_compile.compiler');
    var pathCache = {
        jsio: this.paths.jsio,
        src: basePath
      };

    if (this.paths.squill) {
      pathCache.squill = this.paths.squill;
    }

    compiler.start(['jsio_compile', jsPath, 'import src.' + moduleMain], {
      cwd: basePath,
      environment: 'browser',
      path: [this.paths.jsio],
      includeJsio: false,
      appendImport: true,
      compressSources: this.compress,
      compressResult: this.compress,
      pathCache: pathCache,
      interface: {
        setCompiler: function (compiler) { this.compiler = compiler; },
        run: function (args, opts) { this.compiler.run(args, opts); },
        onError: function (err) {
          logger.error('Error while compiling:', err);
          cb && cb(err);
        },
        onFinish: function (opts, code) {
          if (!fs.existsSync(buildPath)) {
            fs.mkdirSync(buildPath);
          }

          code = ';(function(jsio){' + code + '})(jsio.clone());';
          var filename = path.join(buildPath, 'index.js');
          fs.writeFile(filename, code, cb);
        },
        compress: function (filename, src, opts, cb) {
          var result = lazy.UglifyJS.minify(src, {
            fromString: true,
            compress: {
              global_defs: {
                DEBUG: false
              }
            }
          });

          cb(result.code);
        }
      }
    });
  },


  compile: function(tasks) {
    // Check for stylus main file
    if (fs.existsSync(this.paths.stylusMain)) {
      tasks.push(this.promiseBuildStylus(this.paths.stylusMain));
    }

    // Check for javascript stuff (required)
    tasks.push(this.promiseBuildJS());
  },


  watch: function(tasks) {
    var runningTask = null;
    var taskQueue = [];
    var queueTask = function(fn) {
      if (runningTask) {
        this.logger.info('watch task already running, queueing');
        taskQueue.push(fn);
        return;
      }

      runningTask = fn();
      runningTask.then(function() {
        if (taskQueue.length > 0) {
          runningTask = taskQueue.shift()();
        } else {
          runningTask = null;
        }
      });
    }.bind(this);

    gulp.watch(path.join(this.srcPath, 'stylus', '**', '**.styl'), function() {
      this.logger.info('stylus changed');
      queueTask(function() {
        return this.promiseBuildStylus(this.paths.stylusMain);
      }.bind(this));
    }.bind(this));

    gulp.watch([
      path.join(this.srcPath, '**', '**.js')
    ], function() {
      this.logger.info('js changed');
      queueTask(function() {
        return this.promiseBuildJS();
      }.bind(this));
    }.bind(this));
  }

});
