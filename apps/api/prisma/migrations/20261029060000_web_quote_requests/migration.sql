-- CreateEnum
CREATE TYPE "WebQuoteRequestStatus" AS ENUM ('NEW', 'IN_REVIEW', 'QUOTED', 'DISCARDED');

-- CreateTable
CREATE TABLE "web_quote_requests" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "idea" TEXT NOT NULL,
    "attachmentPath" TEXT,
    "attachmentName" TEXT,
    "attachmentType" TEXT,
    "attachmentSize" INTEGER,
    "status" "WebQuoteRequestStatus" NOT NULL DEFAULT 'NEW',
    "adminNote" TEXT NOT NULL DEFAULT '',
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "web_quote_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "web_quote_requests_externalId_key" ON "web_quote_requests"("externalId");

-- CreateIndex
CREATE INDEX "web_quote_requests_status_requestedAt_idx" ON "web_quote_requests"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "web_quote_requests_customerId_idx" ON "web_quote_requests"("customerId");

-- AddForeignKey
ALTER TABLE "web_quote_requests" ADD CONSTRAINT "web_quote_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

