"""
Unit tests for TypeScript LivePortrait Client
Run with: npm test or jest
"""

// Note: This is a TypeScript test file template
// To be used with Jest or Vitest in the main Secretary project

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createLivePortraitClient, EmotionType } from '../client/LivePortraitClient';
import fs from 'fs/promises';
import path from 'path';

describe('LivePortraitClient', () => {
  const client = createLivePortraitClient({
    baseUrl: process.env.LIVEPORTRAIT_URL || 'http://localhost:8001',
    timeout: 30000,
    enableLogging: true,
  });

  const testImagePath = path.join(__dirname, 'fixtures', 'test_portrait.jpg');

  describe('Health Check', () => {
    it('should return health status', async () => {
      const health = await client.health();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('gpuAvailable');
      expect(health).toHaveProperty('modelLoaded');
    });

    it('should wait for service to become healthy', async () => {
      const isHealthy = await client.waitForHealthy(5, 1000);
      expect(isHealthy).toBe(true);
    });
  });

  describe('Render Avatar', () => {
    it('should render with default parameters', async () => {
      const result = await client.render({
        sourceImage: testImagePath,
      });

      expect(result.emotion).toBe(EmotionType.NEUTRAL);
      expect(result.latencyMs).toBeGreaterThan(0);
      expect(result.filename).toBeTruthy();
      expect(result.width).toBe(512);
      expect(result.height).toBe(512);
    });

    it('should render with happy emotion', async () => {
      const result = await client.render({
        sourceImage: testImagePath,
        emotion: EmotionType.HAPPY,
        intensity: 0.8,
      });

      expect(result.emotion).toBe(EmotionType.HAPPY);
      expect(result.intensity).toBe(0.8);
    });

    it('should render with buffer input', async () => {
      const imageBuffer = await fs.readFile(testImagePath);

      const result = await client.render({
        sourceImage: imageBuffer,
        emotion: EmotionType.SAD,
        intensity: 0.6,
      });

      expect(result.emotion).toBe(EmotionType.SAD);
    });

    it('should respect custom dimensions', async () => {
      const result = await client.render({
        sourceImage: testImagePath,
        width: 256,
        height: 256,
      });

      expect(result.width).toBe(256);
      expect(result.height).toBe(256);
    });

    it('should support different output formats', async () => {
      const pngResult = await client.render({
        sourceImage: testImagePath,
        outputFormat: 'png',
      });
      expect(pngResult.filename).toMatch(/\.png$/);

      const jpgResult = await client.render({
        sourceImage: testImagePath,
        outputFormat: 'jpg',
      });
      expect(jpgResult.filename).toMatch(/\.jpg$/);
    });
  });

  describe('Batch Rendering', () => {
    it('should render multiple emotions', async () => {
      const emotions = [
        EmotionType.NEUTRAL,
        EmotionType.HAPPY,
        EmotionType.SAD,
      ];

      const results = await client.renderBatch(
        testImagePath,
        emotions,
        0.7
      );

      expect(results).toHaveLength(3);
      expect(results[0].emotion).toBe(EmotionType.NEUTRAL);
      expect(results[1].emotion).toBe(EmotionType.HAPPY);
      expect(results[2].emotion).toBe(EmotionType.SAD);
    });

    it('should render all emotions', async () => {
      const allEmotions = Object.values(EmotionType);

      const results = await client.renderBatch(
        testImagePath,
        allEmotions,
        0.6
      );

      expect(results).toHaveLength(allEmotions.length);
    });
  });

  describe('Output Management', () => {
    let testFilename: string;

    beforeAll(async () => {
      const result = await client.render({
        sourceImage: testImagePath,
      });
      testFilename = result.filename;
    });

    it('should download output file', async () => {
      const buffer = await client.downloadOutput(testFilename);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should delete output file', async () => {
      await expect(client.deleteOutput(testFilename)).resolves.not.toThrow();
    });

    it('should fail to download deleted file', async () => {
      await expect(client.downloadOutput(testFilename)).rejects.toThrow();
    });
  });

  describe('Metrics', () => {
    it('should fetch Prometheus metrics', async () => {
      const metrics = await client.getMetrics();
      expect(metrics).toContain('liveportrait_requests_total');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid image path', async () => {
      await expect(
        client.render({
          sourceImage: '/nonexistent/image.jpg',
        })
      ).rejects.toThrow();
    });

    it('should handle timeout', async () => {
      const slowClient = createLivePortraitClient({
        baseUrl: 'http://localhost:8001',
        timeout: 1, // 1ms timeout
      });

      await expect(
        slowClient.render({
          sourceImage: testImagePath,
        })
      ).rejects.toThrow();
    });

    it('should handle invalid service URL', async () => {
      const badClient = createLivePortraitClient({
        baseUrl: 'http://localhost:9999',
        timeout: 1000,
      });

      await expect(badClient.health()).rejects.toThrow();
    });
  });
});
