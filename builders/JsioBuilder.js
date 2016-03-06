'use strict';

let path = require('path');
let fs = require('fs');

let gulp = require('gulp');
let plugins = require('gulp-load-plugins')();

let lazy = require('lazy-cache')(require);
lazy('nib');
lazy('uglify-js', 'UglifyJS');
lazy('resolve');
lazy('bluebird', 'Promise');

let Builder = require('./Builder');
let logging = require('../logging');


class JsioBuilder extends Builder {
  constructor (pluginBuilder, opts) {
    super(pluginBuilder, opts);

    this.paths = {
      base: path.join(__dirname, '..', '..'),
      stylusMain: path.join(this.srcPath, 'stylus', 'main.styl')
    };

    // lookup squill and jsio dynamically, prefer a version found in the module
    // in case the module uses a specific version of squill/jsio
    try {
      let squillPath = path.dirname(lazy.resolve.sync('squill/Widget', {basedir: this.modulePath}));
      this.paths.squill = squillPath;
    } catch (e) {
      // squill not found in module
    }

    let jsioPath;
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
  }


  _buildStylus (stylusMainPath, cb) {
    this.logger.info('Compiling stylus for ' + this.moduleName + ': ' + stylusMainPath);

    let stream = gulp.src(stylusMainPath)
      .pipe(plugins.stylus({
        use: lazy.nib(),
        sourcemap: this.sourcemaps,
        compress: this.compress
      }))
      .pipe(plugins.concat('index.css'))
      .pipe(gulp.dest(this.buildPath));

    stream.on('end', () => {
      cb();
    });
    stream.on('error', err => {
      cb(err);
    });
  }


  _buildJS (cb) {
    let moduleMain = this.src;
    let buildPath = this.buildPath;
    let jsPath = this.srcPath;
    let basePath = path.dirname(jsPath);

    let logger = this.logger;
    logger.info('Compiling jsMain for ' + this.moduleName + ': ' + moduleMain);
    logger.debug('jsio path:', this.paths.jsio);
    logger.debug('module jsPath:', jsPath);

    let jsio = require('jsio');
    let compilerPath = path.join(jsio.__env.getPath(), '..', 'compilers');
    jsio.path.add(compilerPath);

    let compiler = jsio('import jsio_compile.compiler');
    let pathCache = {
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
        setCompiler: compiler => { this.compiler = compiler; },
        run: (args, opts) => { this.compiler.run(args, opts); },
        onError: err => {
          logger.error('Error while compiling:', err);
          cb && cb(err);
        },
        onFinish: (opts, code) => {
          if (!fs.existsSync(buildPath)) {
            fs.mkdirSync(buildPath);
          }

          code = ';(function(jsio){' + code + '})(jsio.clone());';
          let filename = path.join(buildPath, 'index.js');
          fs.writeFile(filename, code, cb);
        },
        compress: (filename, src, opts, cb) => {
          let result = lazy.UglifyJS.minify(src, {
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
  }


  compile (tasks) {
    // Check for stylus main file
    if (fs.existsSync(this.paths.stylusMain)) {
      tasks.push(this.promiseBuildStylus(this.paths.stylusMain));
    }

    // Check for javascript stuff (required)
    tasks.push(this.promiseBuildJS());
  }


  watch (tasks) {
    let runningTask = null;
    let taskQueue = [];
    let queueTask = fn => {
      if (runningTask) {
        this.logger.info('watch task already running, queueing');
        taskQueue.push(fn);
        return;
      }

      runningTask = fn();
      runningTask.then(() => {
        if (taskQueue.length > 0) {
          runningTask = taskQueue.shift()();
        } else {
          runningTask = null;
        }
      });
    };

    gulp.watch(path.join(this.srcPath, 'stylus', '**', '**.styl'), () => {
      this.logger.info('stylus changed');
      queueTask(() => {
        return this.promiseBuildStylus(this.paths.stylusMain);
      });
    });

    gulp.watch([
      path.join(this.srcPath, '**', '**.js')
    ], () => {
      this.logger.info('js changed');
      queueTask(() => {
        return this.promiseBuildJS();
      });
    });
  }

}

module.exports = JsioBuilder;
