const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function build() {
  try {
    if (!fs.existsSync('dist')) {
      fs.mkdirSync('dist');
    }

    await esbuild.build({
      entryPoints: ['src/main.js'],
      bundle: true,
      outfile: 'dist/bundle.js',
      format: 'iife',
      minify: true,
      target: ['es2020'],
      sourcemap: false,
      define: {
        'process.env.NODE_ENV': '"production"'
      }
    });

    console.log('✅ 已打包 bundle.js');

    // ==================== 复制 public 根文件 ====================
    const publicFiles = ['index.html', 'weapons.json', 'prices.json'];
    publicFiles.forEach(file => {
      const srcPath = path.join('public', file);
      const dstPath = path.join('dist', file);
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, dstPath);
        console.log(`✅ 已复制 ${file}`);
      } else {
        console.warn(`⚠️ ${srcPath} 不存在，跳过复制`);
      }
    });

    // ==================== 复制 public/css 目录 ====================
    const srcCss = path.resolve('public/css');
    const dstCss = path.resolve('dist/css');
    if (fs.existsSync(srcCss)) {
      // 清空已有 dist/css
      if (fs.existsSync(dstCss)) {
        fs.rmSync(dstCss, { recursive: true, force: true });
      }
      fs.cpSync(srcCss, dstCss, { recursive: true });
      console.log('✅ 已复制 css/ 目录');
    } else {
      console.warn('⚠️ public/css 目录不存在，跳过复制');
    }

    // ==================== 复制 assets 目录 ====================
    const srcAssets = path.resolve('assets');
    const dstAssets = path.resolve('dist/assets');

    if (fs.existsSync(dstAssets)) {
      // 清空已有 dist/assets
      fs.rmSync(dstAssets, { recursive: true, force: true });
    }
    if (fs.existsSync(srcAssets)) {
      fs.cpSync(srcAssets, dstAssets, { recursive: true });
      console.log('✅ 已复制 assets/ 目录');
    } else {
      console.warn('⚠️ assets 目录不存在，跳过复制');
    }

    console.log('🎉 Build completed! Files generated in dist/ directory.');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();