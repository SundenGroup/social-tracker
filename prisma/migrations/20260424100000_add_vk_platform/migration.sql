-- Add 'vk' to Platform enum
ALTER TYPE "Platform" ADD VALUE 'vk';

-- Add VK-specific attached-video reference on Post
ALTER TABLE "Post" ADD COLUMN "attachedVideoId" TEXT;
