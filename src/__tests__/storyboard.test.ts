import { describe, expect, it } from 'vitest';
import {
  buildShotSubtitle,
  buildShotTitle,
  buildStoryboardFileName,
  buildStoryboardZipName,
  clampStoryboardCount,
  defaultStoryboardConfig,
  derivePromptForShot,
  STORYBOARD_COUNT_MAX,
  STORYBOARD_COUNT_MIN,
  STORYBOARD_DEFAULT_COUNT,
} from '../utils/storyboard';

describe('storyboard utilities', () => {
  it('exposes a sane default config', () => {
    expect(defaultStoryboardConfig.enabled).toBe(false);
    expect(defaultStoryboardConfig.count).toBe(STORYBOARD_DEFAULT_COUNT);
    expect(STORYBOARD_DEFAULT_COUNT).toBe(9);
    expect(STORYBOARD_COUNT_MIN).toBe(1);
    expect(STORYBOARD_COUNT_MAX).toBe(12);
  });

  it('clamps count to valid range and rounds floats', () => {
    expect(clampStoryboardCount(0)).toBe(STORYBOARD_COUNT_MIN);
    expect(clampStoryboardCount(50)).toBe(STORYBOARD_COUNT_MAX);
    expect(clampStoryboardCount(5.7)).toBe(6);
    expect(clampStoryboardCount(Number.NaN)).toBe(STORYBOARD_DEFAULT_COUNT);
    expect(clampStoryboardCount(-3)).toBe(STORYBOARD_COUNT_MIN);
  });

  it('derives shot prompts that include shot index and constraints', () => {
    const out = derivePromptForShot('电影分镜板, 16:9', 3, 9);
    expect(out).toContain('电影分镜板, 16:9');
    expect(out).toContain('镜头 3 / 9');
    expect(out).toContain('只生成这一个镜头');
    expect(out).toContain('禁止任何手绘');
  });

  it('clamps shot index inside derived prompt', () => {
    const out = derivePromptForShot('base', 99, 9);
    expect(out).toContain('镜头 9 / 9');
  });

  it('builds zero-padded shot file names', () => {
    expect(buildStoryboardFileName('master', 0, 9, 'png')).toBe('storyboard-master.png');
    expect(buildStoryboardFileName('shot', 1, 9, 'png')).toBe('storyboard-shot-01.png');
    expect(buildStoryboardFileName('shot', 9, 9, 'jpg')).toBe('storyboard-shot-09.jpg');
    expect(buildStoryboardFileName('shot', 12, 12, 'png')).toBe('storyboard-shot-12.png');
  });

  it('builds safe zip names with timestamp', () => {
    const a = buildStoryboardZipName('  电影 分镜 板  ');
    expect(a).toMatch(/^storyboard-电影-分镜-板-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}\.zip$/);
    const b = buildStoryboardZipName('');
    expect(b).toMatch(/^storyboard-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}\.zip$/);
  });

  it('builds shot title from framing, angle, movement, focal length and subject', () => {
    const shot = {
      index: 3,
      framing: 'MS',
      angle: 'low',
      focalLength: '35mm',
      movement: 'push',
      subject: '女主角回眸',
      environment: '',
      lighting: '',
      mood: '',
      style: '',
    };
    const title = buildShotTitle(shot);
    expect(title).toContain('镜头 3');
    expect(title).toContain('中景');
    expect(title).toContain('仰拍');
    expect(title).toContain('推');
    expect(title).toContain('35mm');
    expect(title).toContain('女主角回眸');
  });

  it('builds fallback title when no params', () => {
    const title = buildShotTitle({
      index: 5,
      framing: '',
      angle: '',
      focalLength: '',
      movement: '',
      subject: '',
      environment: '',
      lighting: '',
      mood: '',
      style: '',
    });
    expect(title).toBe('镜头 5');
  });

  it('builds subtitle from environment, lighting and mood', () => {
    const subtitle = buildShotSubtitle({
      index: 1,
      framing: '',
      angle: '',
      focalLength: '',
      movement: '',
      subject: '',
      environment: '霓虹灯照亮的雨夜东京街头',
      lighting: '霓虹侧光，冷暖对比',
      mood: '孤独、警觉',
      style: '',
    });
    expect(subtitle).toContain('霓虹灯照亮的雨夜东京街头');
    expect(subtitle).toContain('霓虹侧光，冷暖对比');
    expect(subtitle).toContain('孤独、警觉');
  });

  it('builds fallback subtitle when no description', () => {
    const subtitle = buildShotSubtitle({
      index: 1,
      framing: '',
      angle: '',
      focalLength: '',
      movement: '',
      subject: '',
      environment: '',
      lighting: '',
      mood: '',
      style: '',
    });
    expect(subtitle).toBe('暂无描述');
  });
});
