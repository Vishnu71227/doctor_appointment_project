import express from 'express';
import {
  publicGetPage, publicGetFaqs, publicGetBanners,
  adminListPages, adminGetPage, adminCreatePage, adminUpdatePage, adminDeletePage,
  adminListFaqs, adminCreateFaq, adminUpdateFaq, adminDeleteFaq,
  adminListBanners, adminCreateBanner, adminUpdateBanner, adminDeleteBanner,
} from '../controllers/cms.controller.js';
import { authMiddleware, requireRole, requirePermission } from '../middlewares/auth.middleware.js';

const router = express.Router();

// ── Public routes (no auth — used by frontend pages) ──────────────────────
router.get('/public/pages/:slug', publicGetPage);
router.get('/public/faqs', publicGetFaqs);
router.get('/public/banners', publicGetBanners);

// ── Admin routes ───────────────────────────────────────────────────────────
router.use(authMiddleware);
router.use(requireRole('admin'));

// Pages
router.get('/pages', requirePermission('cms.view'), adminListPages);
router.get('/pages/:slug', requirePermission('cms.view'), adminGetPage);
router.post('/pages', requirePermission('cms.manage'), adminCreatePage);
router.patch('/pages/:slug', requirePermission('cms.manage'), adminUpdatePage);
router.delete('/pages/:slug', requirePermission('cms.manage'), adminDeletePage);

// FAQs
router.get('/faqs', requirePermission('cms.view'), adminListFaqs);
router.post('/faqs', requirePermission('cms.manage'), adminCreateFaq);
router.patch('/faqs/:id', requirePermission('cms.manage'), adminUpdateFaq);
router.delete('/faqs/:id', requirePermission('cms.manage'), adminDeleteFaq);

// Banners
router.get('/banners', requirePermission('cms.view'), adminListBanners);
router.post('/banners', requirePermission('cms.manage'), adminCreateBanner);
router.patch('/banners/:id', requirePermission('cms.manage'), adminUpdateBanner);
router.delete('/banners/:id', requirePermission('cms.manage'), adminDeleteBanner);

export default router;
