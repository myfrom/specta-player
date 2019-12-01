const logger = require('@myfrom/logger'),
      gulp = require('gulp'),
      del = require('del'),
      gulpif = require('gulp-if'),
      through2 = require('through2'),
      workbox = require('workbox-build'),
      { resolve } = require('path');
      // Webpack and dev server
      webpack = require('webpack'),
      Browser = require('browser-sync'),
      webpackDevMiddleware = require('webpack-dev-middleware'),
      wp = require('./webpack.config.js'),
      // Minifiers
      htmlmin = require('gulp-htmlmin'),
      postcss = require('gulp-postcss'),
      autoprefixer = require('autoprefixer'),
      cssnano = require('cssnano'),
      imagemin = require('gulp-imagemin');

const DEV = process.env.NODE_ENV !== 'production';
const DIST = resolve(__dirname, 'dist');
// Sections to be cut out or replaced
const SECTIONS = {
  'src/index.html': {
    'DEV-ANALYTICS-OVERWRITE': {
      action: 'delete-in-between'
    }
  },
  'src/sp-console.html': {
    'POLYMER-BUILD-FIX-CONSOLE': {
      action: 'delete-in-between'
    },
    'POLYMER-BUILD-FIX-CONSOLE-PROPER': {
      action: 'delete-tag'
    }
  },
  'src/sp-upload.html': {
    'POLYMER-BUILD-FIX-UPLOADER': {
      action: 'delete-in-between'
    },
    'POLYMER-BUILD-FIX-UPLOADER-PROPER': {
      action: 'delete-tag'
    }
  }
}

logger.log(DEV ? 'Development mode' : 'Building for production', 'info')


function sections() {
  return through2.obj((file, encoding, callback) => {
    for (let filename in SECTIONS) {
      // Try to match files that have defined sections against current file
      const query = new RegExp(`${filename.replace('/', '[/,\\\\]')}$`, 'i');
      if (query.test(file.path)) {
        // Passed, modofy the file
        if (file.isBuffer()) {
          let content = file.contents.toString(encoding);
          const sectionsInFile = SECTIONS[filename],
                // Looks for sections in commented ::SECTION-NAME:: brackets
                sectionsSearch = content.match(/^.*::([A-Z\-]+)(?<!-END)::.*((\s|.)*?)^.*::([A-Z\-]+)-END::.*/gm);
          if (!sectionsSearch.length)
            // Not founda any, move on
            return callback(null, file);
          sectionsSearch.forEach(result => {
            // For each match execute needed command
            const detailsSearch = result.match(/^.*::([A-Z\-]+)(?<!-END)::.*((\s|.)*?)^.*::([A-Z\-]+)-END::.*/m);
            if (sectionsInFile[detailsSearch[1]].action === 'delete-tag')
              content = content.replace(result, detailsSearch[2]);
            if (sectionsInFile[detailsSearch[1]].action === 'delete-in-between')
              content = content.replace(result, '');
          });
          file.contents = Buffer.from(content, encoding);
          return callback(null, file);
        } else {
          if (!file.isNull())
            logger.log(logger.chalk`Couldn't handle sections in file {red ${filename}}, skipping`, 'warningHigh');
          return callback(null, file);
        }
      }
    }
    // No sections in this file, move on
    return callback(null, file);
  });
}


function cleanup() {
  return del(DIST);
}

function html() {
  return gulp.src(['./src/**/*.html', '!./src/elements/*.html'], { base: './src', sourcemaps: DEV })
    .pipe(gulpif(!DEV, sections()))
    .pipe(gulpif(!DEV, htmlmin({
      collapseBooleanAttributes: true,
      collapseWhitespace: true,
      removeComments: true
    })))
    .pipe(gulp.dest(DIST));
}

function css() {
  return gulp.src(['./src/**/*.css', '!./src/elements/*.css'], { base: './src', sourcemaps: DEV })
    .pipe(gulpif(
      !DEV,
      postcss([ autoprefixer(), cssnano() ]),
      postcss([ autoprefixer() ])
    ))
    .pipe(gulp.dest(DIST));
}

function images() {
  return gulp.src('./src/**/*.+(jpeg|jpg|png|svg)', { base: './src', sourcemaps: DEV })
    .pipe(gulpif(!DEV, imagemin([
      imagemin.gifsicle(), imagemin.jpegtran(), imagemin.optipng(),
      imagemin.svgo({ cleanupIDs: false })
    ])))
    .pipe(gulp.dest(DIST));
}

function copy() {
  return gulp.src('./src/**/*.!(html|js|scss|css|jpeg|jpg|png|svg)', { base: './src', sourcemaps: DEV })
    .pipe(gulp.dest(DIST));
}

const scripts = wp.scripts;

function generateSw() {
  return workbox.injectManifest({
    swSrc: './src/js/service-worker.js',
    swDest: `${DIST}/service-worker.js`,
    globDirectory: DIST,
    globPatterns: ['**/*.*']
  }).then(({count, size}) => {
    logger.log(`Generated SW, will precache ${count} files, ${size} bytes.`, 'info');
  });
}


// Dynamic server

const browser = Browser.create();
const bundler = webpack(wp.config);

const serve = gulp.series(cleanup, gulp.parallel( html, scripts, css, images, copy), () => {

  let config = {
    server: './dist',
    middleware: [
      webpackDevMiddleware(bundler),
    ],
    open: false,
    port: 8080
  }

  browser.init(config);

  const reload = cb => {
    browser.reload();
    cb();
  }

  gulp.watch('../src/**/*.js').on('change', () => browser.reload());
  gulp.watch(['./src/**/*.html', '!./src/elements/*.html'], gulp.series(html, reload));
  gulp.watch(['./src/**/*.css', '!./src/elements/*.css'], gulp.series(css, reload));
  gulp.watch('./src/**/*.+(jpeg|jpg|png|svg)', gulp.series(images, reload));
  gulp.watch('./src/**/*.!(html|js|scss|css|jpeg|jpg|png|svg)', gulp.series(copy, reload));
});

const build =
  gulp.series(
    cleanup,
    gulp.parallel(
      html,
      scripts,
      css,
      images,
      copy
    ),
    generateSw
  );

module.exports = {
  default: build,
  serve, cleanup, html, scripts, css, images, copy, generateSw
}