-- AlterTable
ALTER TABLE "web_quote_requests" ADD COLUMN     "quoteId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "web_quote_requests_quoteId_key" ON "web_quote_requests"("quoteId");

-- AddForeignKey
ALTER TABLE "web_quote_requests" ADD CONSTRAINT "web_quote_requests_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

