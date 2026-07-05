import mongoose from 'mongoose';

const cmsBannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, trim: true },
    image_url: { type: String, default: '' },
    cta_text: { type: String, trim: true },   // Call-to-action button text
    cta_link: { type: String, trim: true },   // CTA URL / route
    position: {
      type: String,
      enum: ['homepage_hero', 'homepage_middle', 'sidebar', 'popup'],
      default: 'homepage_hero',
      index: true,
    },
    order: { type: Number, default: 0 },
    is_published: { type: Boolean, default: true },
    starts_at: { type: Date },
    ends_at: { type: Date },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'cms_banners',
  }
);

cmsBannerSchema.index({ position: 1, order: 1, is_published: 1 });

const CmsBanner = mongoose.model('CmsBanner', cmsBannerSchema);
export default CmsBanner;
