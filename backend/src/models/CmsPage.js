import mongoose from 'mongoose';

/**
 * Static CMS pages.
 * slug is the unique identifier used by the frontend to fetch content.
 * System pages (privacy-policy, terms, about-us etc.) cannot be deleted — only edited.
 */
const cmsPageSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true, default: '' }, // rich HTML / markdown
    meta_title: { type: String, trim: true },
    meta_description: { type: String, trim: true },
    is_published: { type: Boolean, default: true },
    is_system: { type: Boolean, default: false }, // system pages can't be deleted
    last_edited_by: { type: String }, // admin user email
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'cms_pages',
  }
);

const CmsPage = mongoose.model('CmsPage', cmsPageSchema);
export default CmsPage;
