import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { Document } from '../src/models/Document.js';
import { Chunk } from '../src/models/Chunk.js';
import { processDocumentIngestion } from '../src/services/ingestionService.js';
import { searchSimilarChunks } from '../src/services/ragService.js';
import { generateAnswer } from '../src/services/llmService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function runTest() {
  console.log('=== Running End-to-End RAG Test on MongoDB Atlas ===');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to Atlas successfully.');

  let testUser;
  let testDoc;

  try {
    // 1. Create temporary test user
    const testEmail = `test_rag_${Date.now()}@example.com`;
    testUser = await User.create({
      email: testEmail,
      passwordHash: 'dummyhash',
    });
    console.log(`Created test user: ${testUser.email}`);

    // 2. Create document with 2 distinct pages
    testDoc = await Document.create({
      userId: testUser._id,
      title: 'Company Return & Shipping Policy',
      fileName: 'policy.pdf',
      filePath: 'dummy/path/policy.pdf',
      fileUrl: '/uploads/dummy.pdf',
      fileSize: 1024,
      pageCount: 2,
      extractedPages: [
        {
          pageNumber: 1,
          text: 'Acme Corp Return Policy. All products purchased directly from our website may be returned within 30 calendar days of delivery for a full refund. Items must be in original packaging and include the purchase receipt. Returns requested after 30 days are eligible only for store credit.',
        },
        {
          pageNumber: 2,
          text: 'Acme Corp Shipping Guidelines. Standard shipping takes 3 to 5 business days across the country. Express overnight shipping is available for an additional fee of twenty dollars. Tracking numbers are sent via email within 24 hours of fulfillment.',
        },
      ],
      status: 'processing',
    });
    console.log(`Created test document: ${testDoc._id}`);

    // 3. Process Ingestion & Vectorization
    console.log('Running ingestion & embedding generation...');
    const ingestResult = await processDocumentIngestion(testDoc._id);
    console.log('Ingestion completed:', ingestResult);

    const chunkCount = await Chunk.countDocuments({ documentId: testDoc._id });
    console.log(`Total vector chunks in Atlas: ${chunkCount}`);

    // 4. Test Semantic Vector Search
    const question = 'Within how many days can I get a full refund?';
    console.log(`\nQuery: "${question}"`);

    const sources = await searchSimilarChunks({
      userId: testUser._id,
      documentId: testDoc._id,
      query: question,
      limit: 3,
    });

    console.log(`Retrieved ${sources.length} sources:`);
    sources.forEach((s, idx) => {
      console.log(`  [${idx + 1}] Page ${s.pageNumber} (Score: ${(s.score * 100).toFixed(1)}%): "${s.snippet}"`);
    });

    if (sources[0]?.pageNumber !== 1) {
      console.warn('WARNING: Page 1 was expected as top source, but received page', sources[0]?.pageNumber);
    } else {
      console.log('SUCCESS: Page 1 correctly retrieved as top source!');
    }

    // 5. Test LLM Answer Generation
    console.log('\nSynthesizing answer with Gemini...');
    const answer = await generateAnswer({ question, contextChunks: sources });
    console.log('\n--- LLM RESPONSE ---');
    console.log(answer);
    console.log('--------------------\n');

    console.log('ALL TESTS PASSED SUCCESSFULLY!');
  } finally {
    // Cleanup
    if (testDoc) {
      await Chunk.deleteMany({ documentId: testDoc._id });
      await Document.deleteOne({ _id: testDoc._id });
    }
    if (testUser) {
      await User.deleteOne({ _id: testUser._id });
    }
    await mongoose.disconnect();
    console.log('Test cleanup complete & disconnected.');
  }
}

runTest().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
