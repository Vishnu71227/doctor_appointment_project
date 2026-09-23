import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
const API = `${BACKEND_URL}/api`;
const api = (token) => axios.create({ baseURL: API, headers: { Authorization: `Bearer ${token}` } });

const BANNER_POSITIONS = ['homepage_hero', 'homepage_middle', 'sidebar', 'popup'];

export default function AdminCMS({ token }) {
  const [subTab, setSubTab] = useState('pages');

  // Pages state
  const [pages, setPages] = useState([]);
  const [pageModal, setPageModal] = useState(null); // null | { mode, data? }
  const [pageForm, setPageForm] = useState({ slug: '', title: '', content: '', meta_title: '', meta_description: '', is_published: true });

  // FAQs state
  const [faqs, setFaqs] = useState([]);
  const [faqModal, setFaqModal] = useState(null);
  const [faqForm, setFaqForm] = useState({ question: '', answer: '', category: 'General', order: 0, is_published: true });

  // Banners state
  const [banners, setBanners] = useState([]);
  const [bannerModal, setBannerModal] = useState(null);
  const [bannerForm, setBannerForm] = useState({ title: '', subtitle: '', image_url: '', cta_text: '', cta_link: '', position: 'homepage_hero', order: 0, is_published: true, starts_at: '', ends_at: '' });

  const [loading, setLoading] = useState(false);

  const fetchPages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(token).get('/cms/pages');
      setPages(res.data.pages);
    } catch { toast.error('Pages load nahi ho sake'); }
    finally { setLoading(false); }
  }, [token]);

  const fetchFaqs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(token).get('/cms/faqs');
      setFaqs(res.data.faqs);
    } catch { toast.error('FAQs load nahi ho sake'); }
    finally { setLoading(false); }
  }, [token]);

  const fetchBanners = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(token).get('/cms/banners');
      setBanners(res.data.banners);
    } catch { toast.error('Banners load nahi ho sake'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    if (subTab === 'pages') fetchPages();
    else if (subTab === 'faqs') fetchFaqs();
    else if (subTab === 'banners') fetchBanners();
  }, [subTab, fetchPages, fetchFaqs, fetchBanners]);

  // ── PAGE CRUD ────────────────────────────────────────────────
  const openCreatePage = () => {
    setPageForm({ slug: '', title: '', content: '', meta_title: '', meta_description: '', is_published: true });
    setPageModal({ mode: 'create' });
  };

  const openEditPage = (p) => {
    setPageForm({ slug: p.slug, title: p.title, content: p.content || '', meta_title: p.meta_title || '', meta_description: p.meta_description || '', is_published: p.is_published });
    setPageModal({ mode: 'edit', data: p });
  };

  const savePage = async () => {
    try {
      if (pageModal.mode === 'create') {
        await api(token).post('/cms/pages', pageForm);
        toast.success('Page create ho gaya');
      } else {
        await api(token).patch(`/cms/pages/${pageModal.data.slug}`, pageForm);
        toast.success('Page update ho gaya');
      }
      setPageModal(null);
      fetchPages();
    } catch (err) { toast.error(err.response?.data?.detail || 'Save failed'); }
  };

  const deletePage = async (slug) => {
    if (!window.confirm('Page delete karna hai?')) return;
    try {
      await api(token).delete(`/cms/pages/${slug}`);
      toast.success('Page delete ho gaya');
      fetchPages();
    } catch (err) { toast.error(err.response?.data?.detail || 'Delete failed'); }
  };

  // ── FAQ CRUD ─────────────────────────────────────────────────
  const openCreateFaq = () => {
    setFaqForm({ question: '', answer: '', category: 'General', order: 0, is_published: true });
    setFaqModal({ mode: 'create' });
  };

  const openEditFaq = (f) => {
    setFaqForm({ question: f.question, answer: f.answer, category: f.category, order: f.order, is_published: f.is_published });
    setFaqModal({ mode: 'edit', data: f });
  };

  const saveFaq = async () => {
    try {
      if (faqModal.mode === 'create') {
        await api(token).post('/cms/faqs', faqForm);
        toast.success('FAQ add ho gaya');
      } else {
        await api(token).patch(`/cms/faqs/${faqModal.data._id}`, faqForm);
        toast.success('FAQ update ho gaya');
      }
      setFaqModal(null);
      fetchFaqs();
    } catch (err) { toast.error(err.response?.data?.detail || 'Save failed'); }
  };

  const deleteFaq = async (id) => {
    if (!window.confirm('FAQ delete karna hai?')) return;
    try {
      await api(token).delete(`/cms/faqs/${id}`);
      toast.success('FAQ delete ho gaya');
      fetchFaqs();
    } catch (err) { toast.error(err.response?.data?.detail || 'Delete failed'); }
  };

  // ── BANNER CRUD ──────────────────────────────────────────────
  const openCreateBanner = () => {
    setBannerForm({ title: '', subtitle: '', image_url: '', cta_text: '', cta_link: '', position: 'homepage_hero', order: 0, is_published: true, starts_at: '', ends_at: '' });
    setBannerModal({ mode: 'create' });
  };

  const openEditBanner = (b) => {
    setBannerForm({ title: b.title, subtitle: b.subtitle || '', image_url: b.image_url || '', cta_text: b.cta_text || '', cta_link: b.cta_link || '', position: b.position, order: b.order, is_published: b.is_published, starts_at: b.starts_at ? b.starts_at.slice(0, 10) : '', ends_at: b.ends_at ? b.ends_at.slice(0, 10) : '' });
    setBannerModal({ mode: 'edit', data: b });
  };

  const saveBanner = async () => {
    try {
      if (bannerModal.mode === 'create') {
        await api(token).post('/cms/banners', bannerForm);
        toast.success('Banner create ho gaya');
      } else {
        await api(token).patch(`/cms/banners/${bannerModal.data._id}`, bannerForm);
        toast.success('Banner update ho gaya');
      }
      setBannerModal(null);
      fetchBanners();
    } catch (err) { toast.error(err.response?.data?.detail || 'Save failed'); }
  };

  const deleteBanner = async (id) => {
    if (!window.confirm('Banner delete karna hai?')) return;
    try {
      await api(token).delete(`/cms/banners/${id}`);
      toast.success('Banner delete ho gaya');
      fetchBanners();
    } catch (err) { toast.error(err.response?.data?.detail || 'Delete failed'); }
  };

  const InputRow = ({ label, children }) => (
    <div className="mb-3">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-2 mb-5">
        {[{ id: 'pages', label: '📄 Pages' }, { id: 'faqs', label: '❓ FAQs' }, { id: 'banners', label: '🖼️ Banners' }].map((t) => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium ${subTab === t.id ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-gray-400 text-sm mb-3">Loading…</p>}

      {/* ── PAGES ── */}
      {subTab === 'pages' && (
        <div>
          <div className="flex justify-end mb-3">
            <button onClick={openCreatePage} className="bg-teal-600 text-white px-4 py-2 rounded-full text-sm hover:bg-teal-700">+ New Page</button>
          </div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr><th className="p-3">Title</th><th className="p-3">Slug</th><th className="p-3">Status</th><th className="p-3">Last Edited By</th><th className="p-3">Actions</th></tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={p.slug} className="border-t">
                    <td className="p-3 font-medium">{p.title} {p.is_system && <span className="text-xs text-gray-400 ml-1">system</span>}</td>
                    <td className="p-3 text-gray-500">/{p.slug}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${p.is_published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {p.is_published ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td className="p-3 text-gray-400 text-xs">{p.last_edited_by || '—'}</td>
                    <td className="p-3 flex gap-2">
                      <button onClick={() => openEditPage(p)} className="text-teal-600 text-xs hover:underline">Edit</button>
                      {!p.is_system && <button onClick={() => deletePage(p.slug)} className="text-red-500 text-xs hover:underline">Delete</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── FAQs ── */}
      {subTab === 'faqs' && (
        <div>
          <div className="flex justify-end mb-3">
            <button onClick={openCreateFaq} className="bg-teal-600 text-white px-4 py-2 rounded-full text-sm hover:bg-teal-700">+ New FAQ</button>
          </div>
          <div className="space-y-3">
            {faqs.map((f) => (
              <div key={f._id} className="bg-white rounded-xl border p-4">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1">
                    <p className="font-medium text-gray-800 text-sm">{f.question}</p>
                    <p className="text-gray-500 text-sm mt-1">{f.answer}</p>
                    <div className="flex gap-2 mt-2">
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{f.category}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${f.is_published ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>{f.is_published ? 'Published' : 'Draft'}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => openEditFaq(f)} className="text-teal-600 text-xs hover:underline">Edit</button>
                    <button onClick={() => deleteFaq(f._id)} className="text-red-500 text-xs hover:underline">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── BANNERS ── */}
      {subTab === 'banners' && (
        <div>
          <div className="flex justify-end mb-3">
            <button onClick={openCreateBanner} className="bg-teal-600 text-white px-4 py-2 rounded-full text-sm hover:bg-teal-700">+ New Banner</button>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {banners.map((b) => (
              <div key={b._id} className="bg-white rounded-xl border p-4">
                {b.image_url && <img src={b.image_url} alt={b.title} className="w-full h-28 object-cover rounded-lg mb-3" onError={(e) => e.target.style.display = 'none'} />}
                <h4 className="font-semibold text-gray-800">{b.title}</h4>
                {b.subtitle && <p className="text-sm text-gray-500">{b.subtitle}</p>}
                <div className="flex gap-2 mt-2 flex-wrap">
                  <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">{b.position}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${b.is_published ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>{b.is_published ? 'Live' : 'Draft'}</span>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => openEditBanner(b)} className="text-teal-600 text-xs hover:underline">Edit</button>
                  <button onClick={() => deleteBanner(b._id)} className="text-red-500 text-xs hover:underline">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ PAGE MODAL ══ */}
      {pageModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-lg mb-4">{pageModal.mode === 'create' ? 'New Page' : `Edit: ${pageModal.data.title}`}</h3>
            {pageModal.mode === 'create' && (
              <InputRow label="Slug (URL path e.g. refund-policy)">
                <input value={pageForm.slug} onChange={(e) => setPageForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') }))} className="border rounded-xl px-4 py-2 text-sm w-full" placeholder="e.g. refund-policy" />
              </InputRow>
            )}
            <InputRow label="Title">
              <input value={pageForm.title} onChange={(e) => setPageForm((f) => ({ ...f, title: e.target.value }))} className="border rounded-xl px-4 py-2 text-sm w-full" />
            </InputRow>
            <InputRow label="Content (HTML supported)">
              <textarea value={pageForm.content} onChange={(e) => setPageForm((f) => ({ ...f, content: e.target.value }))} className="border rounded-xl px-4 py-2 text-sm w-full resize-y" rows={10} />
            </InputRow>
            <InputRow label="Meta Title (SEO)">
              <input value={pageForm.meta_title} onChange={(e) => setPageForm((f) => ({ ...f, meta_title: e.target.value }))} className="border rounded-xl px-4 py-2 text-sm w-full" />
            </InputRow>
            <InputRow label="Meta Description (SEO)">
              <input value={pageForm.meta_description} onChange={(e) => setPageForm((f) => ({ ...f, meta_description: e.target.value }))} className="border rounded-xl px-4 py-2 text-sm w-full" />
            </InputRow>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-sm font-medium text-gray-700">Status:</span>
              <button onClick={() => setPageForm((f) => ({ ...f, is_published: true }))} className={`px-3 py-1 rounded-full text-xs ${pageForm.is_published ? 'bg-green-600 text-white' : 'border text-gray-500'}`}>Published</button>
              <button onClick={() => setPageForm((f) => ({ ...f, is_published: false }))} className={`px-3 py-1 rounded-full text-xs ${!pageForm.is_published ? 'bg-gray-500 text-white' : 'border text-gray-500'}`}>Draft</button>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPageModal(null)} className="flex-1 border rounded-xl py-2 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={savePage} className="flex-1 bg-teal-600 text-white rounded-xl py-2 text-sm font-semibold hover:bg-teal-700">Save Page</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ FAQ MODAL ══ */}
      {faqModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg">
            <h3 className="font-semibold text-lg mb-4">{faqModal.mode === 'create' ? 'New FAQ' : 'Edit FAQ'}</h3>
            <InputRow label="Question">
              <input value={faqForm.question} onChange={(e) => setFaqForm((f) => ({ ...f, question: e.target.value }))} className="border rounded-xl px-4 py-2 text-sm w-full" />
            </InputRow>
            <InputRow label="Answer">
              <textarea value={faqForm.answer} onChange={(e) => setFaqForm((f) => ({ ...f, answer: e.target.value }))} className="border rounded-xl px-4 py-2 text-sm w-full resize-none" rows={4} />
            </InputRow>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <InputRow label="Category">
                <input value={faqForm.category} onChange={(e) => setFaqForm((f) => ({ ...f, category: e.target.value }))} className="border rounded-xl px-4 py-2 text-sm w-full" />
              </InputRow>
              <InputRow label="Order (sort)">
                <input type="number" value={faqForm.order} onChange={(e) => setFaqForm((f) => ({ ...f, order: Number(e.target.value) }))} className="border rounded-xl px-4 py-2 text-sm w-full" />
              </InputRow>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-sm font-medium text-gray-700">Status:</span>
              <button onClick={() => setFaqForm((f) => ({ ...f, is_published: true }))} className={`px-3 py-1 rounded-full text-xs ${faqForm.is_published ? 'bg-green-600 text-white' : 'border text-gray-500'}`}>Published</button>
              <button onClick={() => setFaqForm((f) => ({ ...f, is_published: false }))} className={`px-3 py-1 rounded-full text-xs ${!faqForm.is_published ? 'bg-gray-500 text-white' : 'border text-gray-500'}`}>Draft</button>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setFaqModal(null)} className="flex-1 border rounded-xl py-2 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={saveFaq} className="flex-1 bg-teal-600 text-white rounded-xl py-2 text-sm font-semibold hover:bg-teal-700">Save FAQ</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ BANNER MODAL ══ */}
      {bannerModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-lg mb-4">{bannerModal.mode === 'create' ? 'New Banner' : 'Edit Banner'}</h3>
            <InputRow label="Title"><input value={bannerForm.title} onChange={(e) => setBannerForm((f) => ({ ...f, title: e.target.value }))} className="border rounded-xl px-4 py-2 text-sm w-full" /></InputRow>
            <InputRow label="Subtitle"><input value={bannerForm.subtitle} onChange={(e) => setBannerForm((f) => ({ ...f, subtitle: e.target.value }))} className="border rounded-xl px-4 py-2 text-sm w-full" /></InputRow>
            <InputRow label="Image URL"><input value={bannerForm.image_url} onChange={(e) => setBannerForm((f) => ({ ...f, image_url: e.target.value }))} className="border rounded-xl px-4 py-2 text-sm w-full" placeholder="https://..." /></InputRow>
            <InputRow label="CTA Button Text"><input value={bannerForm.cta_text} onChange={(e) => setBannerForm((f) => ({ ...f, cta_text: e.target.value }))} className="border rounded-xl px-4 py-2 text-sm w-full" /></InputRow>
            <InputRow label="CTA Link"><input value={bannerForm.cta_link} onChange={(e) => setBannerForm((f) => ({ ...f, cta_link: e.target.value }))} className="border rounded-xl px-4 py-2 text-sm w-full" placeholder="/doctors" /></InputRow>
            <div className="grid grid-cols-2 gap-3">
              <InputRow label="Position">
                <select value={bannerForm.position} onChange={(e) => setBannerForm((f) => ({ ...f, position: e.target.value }))} className="border rounded-xl px-4 py-2 text-sm w-full">
                  {BANNER_POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </InputRow>
              <InputRow label="Order"><input type="number" value={bannerForm.order} onChange={(e) => setBannerForm((f) => ({ ...f, order: Number(e.target.value) }))} className="border rounded-xl px-4 py-2 text-sm w-full" /></InputRow>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <InputRow label="Starts At"><input type="date" value={bannerForm.starts_at} onChange={(e) => setBannerForm((f) => ({ ...f, starts_at: e.target.value }))} className="border rounded-xl px-4 py-2 text-sm w-full" /></InputRow>
              <InputRow label="Ends At"><input type="date" value={bannerForm.ends_at} onChange={(e) => setBannerForm((f) => ({ ...f, ends_at: e.target.value }))} className="border rounded-xl px-4 py-2 text-sm w-full" /></InputRow>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-sm font-medium text-gray-700">Status:</span>
              <button onClick={() => setBannerForm((f) => ({ ...f, is_published: true }))} className={`px-3 py-1 rounded-full text-xs ${bannerForm.is_published ? 'bg-green-600 text-white' : 'border text-gray-500'}`}>Live</button>
              <button onClick={() => setBannerForm((f) => ({ ...f, is_published: false }))} className={`px-3 py-1 rounded-full text-xs ${!bannerForm.is_published ? 'bg-gray-500 text-white' : 'border text-gray-500'}`}>Draft</button>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setBannerModal(null)} className="flex-1 border rounded-xl py-2 text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={saveBanner} className="flex-1 bg-teal-600 text-white rounded-xl py-2 text-sm font-semibold hover:bg-teal-700">Save Banner</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
