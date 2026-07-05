import mongoose from 'mongoose';

const cmsFaqSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true, trim: true },
    category: {
      type: String,
      default: 'General',
      trim: true,
      index: true,
    },
    order: { type: Number, default: 0 }, // for manual sorting
    is_published: { type: Boolean, default: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'cms_faqs',
  }
);

cmsFaqSchema.index({ category: 1, order: 1 });

const CmsFaq = mongoose.model('CmsFaq', cmsFaqSchema);
export default CmsFaq;
