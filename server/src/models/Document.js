import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    pageCount: {
      type: Number,
      default: 0,
    },
    // Array of { pageNumber, text } extracted from PDF
    extractedPages: [
      {
        pageNumber: { type: Number, required: true },
        text: { type: String, default: '' },
      },
    ],
    status: {
      type: String,
      enum: ['processing', 'ready', 'failed'],
      default: 'processing',
      index: true,
    },
    errorMessage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
  }
);

export const Document = mongoose.model('Document', documentSchema);
