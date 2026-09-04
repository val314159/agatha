import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.env.AVATAR_VIEWER_URL || 'http://localhost:5173/';
const executablePath = process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser';

const checks = [
  {
    name: 'desktop-vrm',
    model: '/models/avaAvatar.vrm',
    viewport: { width: 1280, height: 900 },
  },
  {
    name: 'mobile-gltf',
    model: '/models/cube.gltf',
    viewport: { width: 390, height: 844 },
  },
];

await mkdir('.tmp', { recursive: true });

const browser = await chromium.launch({
  executablePath,
  args: ['--no-sandbox', '--disable-gpu'],
});

try {
  for (const check of checks) {
    await runCheck(browser, check);
  }
} finally {
  await browser.close();
}

async function runCheck(browser, check) {
  const page = await browser.newPage({
    viewport: check.viewport,
    deviceScaleFactor: 1,
  });

  page.on('pageerror', (error) => {
    throw error;
  });

  const url = new URL(baseUrl);
  url.searchParams.set('model', check.model);

  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#model-state[data-tone="ready"]', {
    timeout: 45000,
  });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    return canvas && canvas.width > 0 && canvas.height > 0;
  });

  await page.screenshot({
    path: `.tmp/avatar-viewer-${check.name}.png`,
    fullPage: true,
  });

  const result = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const meshText = document.querySelector('#meta-meshes')?.textContent || '0';
    const triangleText = document.querySelector('#meta-triangles')?.textContent || '0';
    const meshes = Number(meshText.replaceAll(',', ''));
    const triangles = Number(triangleText.replaceAll(',', ''));

    if (!gl) {
      return { ok: false, reason: 'missing WebGL context', meshes, triangles };
    }

    const width = canvas.width;
    const height = canvas.height;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    const colors = new Set();
    let alphaPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] > 0) {
        alphaPixels += 1;
      }
      if (colors.size < 512) {
        colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]},${pixels[i + 3]}`);
      }
    }

    return {
      ok: meshes > 0 && triangles > 0 && alphaPixels > 1000 && colors.size > 8,
      width,
      height,
      meshes,
      triangles,
      alphaPixels,
      colors: colors.size,
    };
  });

  await page.click('#tab-stage');
  await page.waitForFunction(() => {
    const panel = document.querySelector('#panel-stage');
    const tab = document.querySelector('#tab-stage');
    return panel && tab && !panel.hidden && tab.classList.contains('is-active');
  });
  await page.evaluate(() => {
    const background = document.querySelector('#background-color');
    background.value = '#e9f4ff';
    background.dispatchEvent(new Event('input', { bubbles: true }));

    const grid = document.querySelector('#grid-visible');
    grid.checked = false;
    grid.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(50);
  await page.screenshot({
    path: `.tmp/avatar-viewer-${check.name}-stage.png`,
    fullPage: true,
  });

  await page.click('#tab-moves');
  await page.waitForFunction(() => {
    const panel = document.querySelector('#panel-moves');
    const tab = document.querySelector('#tab-moves');
    return panel && tab && !panel.hidden && tab.classList.contains('is-active');
  });
  await page.waitForFunction(() => {
    return document.querySelectorAll('.move-item').length === 8;
  });
  await page.locator('.move-item').nth(6).click();
  await page.click('#move-play');
  await page.waitForFunction(() => {
    return document.querySelector('#move-play')?.textContent === 'Pause';
  });
  await page.waitForTimeout(250);
  await page.waitForFunction(() => {
    return document.querySelector('#move-phase')?.textContent !== '-';
  });
  await page.screenshot({
    path: `.tmp/avatar-viewer-${check.name}-moves.png`,
    fullPage: true,
  });
  await page.click('#move-play');

  await page.click('#tab-ava');
  await page.waitForFunction(() => {
    const panel = document.querySelector('#panel-ava');
    const tab = document.querySelector('#tab-ava');
    return panel && tab && !panel.hidden && tab.classList.contains('is-active');
  });
  await page.waitForFunction(() => {
    return document.querySelectorAll('.fbx-item').length === 6;
  });
  await page.locator('.fbx-item').nth(2).click();
  if (check.model.endsWith('.vrm')) {
    for (const stage of ['avar', 'avay', 'avaz']) {
      await page.locator('.stage-choice label').filter({ hasText: stage.toUpperCase() }).click();
      await page.click('#ava-play');
      await page.waitForFunction(() => {
        return document.querySelector('#ava-play')?.textContent === 'Playing';
      }, { timeout: 45000 });
      await page.waitForFunction((expectedStage) => {
        return document.querySelector('#ava-stage-active')?.textContent === expectedStage.toUpperCase();
      }, stage);
      if (stage !== 'avar') {
        await page.waitForFunction((expectedStage) => {
          const analysisState = document.querySelector('#ava-analysis-state')?.textContent;
          const fps = document.querySelector('#ava-analysis-fps')?.textContent;
          const penetration = document.querySelector('#ava-analysis-penetration')?.textContent;
          return (
            analysisState === expectedStage.toUpperCase() &&
            fps &&
            fps !== '-' &&
            penetration &&
            penetration !== '-'
          );
        }, stage);
      }
      await page.click('#ava-stop');
    }
  }
  await page.screenshot({
    path: `.tmp/avatar-viewer-${check.name}-ava.png`,
    fullPage: true,
  });

  await page.click('#tab-rig');
  await page.waitForFunction(() => {
    const panel = document.querySelector('#panel-rig');
    const tab = document.querySelector('#tab-rig');
    return panel && tab && !panel.hidden && tab.classList.contains('is-active');
  });

  let boneCount = await readBoneCount(page);
  if (boneCount === 0) {
    await page.selectOption('#rig-mode', 'raw');
    await page.waitForTimeout(50);
    boneCount = await readBoneCount(page);
  }
  if (check.model.endsWith('.vrm') && boneCount === 0) {
    throw new Error(`${check.name} failed: no bones found in Rig tab`);
  }
  if (boneCount > 0) {
    await page.check('#skeleton-visible');
    await page.locator('.bone-item').first().click();
    await page.waitForFunction(() => {
      return document.querySelector('#bone-name')?.textContent !== '-';
    });
    await page.waitForFunction(() => {
      return document.querySelector('#bone-rotation-controls')?.disabled === false;
    });
    await page.locator('.bone-rotation-number[data-axis="x"]').fill('15');
    await page.waitForFunction(() => {
      return document.querySelector('#bone-local-rotation')?.textContent.includes('x 15.000');
    });
    await page.click('#bone-reset-rotation');
  }
  await page.screenshot({
    path: `.tmp/avatar-viewer-${check.name}-rig.png`,
    fullPage: true,
  });

  await page.close();

  if (!result.ok) {
    throw new Error(`${check.name} failed: ${JSON.stringify(result)}`);
  }

  console.log(`${check.name} ok`, result);
}

async function readBoneCount(page) {
  const text = await page.locator('#rig-count').textContent();
  return Number(text || 0);
}
