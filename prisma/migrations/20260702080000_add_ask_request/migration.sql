CREATE TABLE "AskRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'live',
    "model" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "toolCalls" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AskRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AskRequest_userId_createdAt_idx" ON "AskRequest"("userId", "createdAt");
CREATE INDEX "AskRequest_organizationId_createdAt_idx" ON "AskRequest"("organizationId", "createdAt");
