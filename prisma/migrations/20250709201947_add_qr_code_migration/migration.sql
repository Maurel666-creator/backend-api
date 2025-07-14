-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "qRCodeId" INTEGER;

-- CreateTable
CREATE TABLE "QRCode" (
    "id" SERIAL NOT NULL,
    "libraryId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QRCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QRCode_content_key" ON "QRCode"("content");

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_qRCodeId_fkey" FOREIGN KEY ("qRCodeId") REFERENCES "QRCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QRCode" ADD CONSTRAINT "QRCode_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "Library"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
