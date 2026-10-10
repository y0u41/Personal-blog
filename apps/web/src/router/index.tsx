import { Navigate, createBrowserRouter } from 'react-router-dom';
import Layout from '../components/Layout';
import ProtectedRoute from '../components/ProtectedRoute';
import Home from '../pages/Home';
import PostDetail from '../pages/PostDetail';
import CategoryArchive from '../pages/CategoryArchive';
import TagArchive from '../pages/TagArchive';
import Archive from '../pages/Archive';
import Rank from '../pages/Rank';
import Favorites from '../pages/Favorites';
import Write from '../pages/Write';
import Profile from '../pages/Profile';
import Login from '../pages/Login';
import Register from '../pages/Register';
import NotFound from '../pages/NotFound';
import AdminLayout from '../pages/admin/AdminLayout';
import AdminUsers from '../pages/admin/AdminUsers';
import AdminComments from '../pages/admin/AdminComments';
import AdminCategories from '../pages/admin/AdminCategories';
import AdminTags from '../pages/admin/AdminTags';

// 路由表（与 Tech_Design.md 对齐）：
// 详情用 slug、写作用 id，列表走查询参数；/write 与 /me 需登录，/admin 需管理员。
// 前端的角色门禁只用于「入口显隐 + 提前拦截」，真正的权限判定始终在后端。
export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/post/:slug', element: <PostDetail /> },
      { path: '/category/:slug', element: <CategoryArchive /> },
      { path: '/tag/:slug', element: <TagArchive /> },
      { path: '/archive', element: <Archive /> },
      { path: '/rank', element: <Rank /> },
      {
        path: '/write',
        element: (
          <ProtectedRoute roles={['admin', 'author']}>
            <Write />
          </ProtectedRoute>
        ),
      },
      {
        path: '/write/:id',
        element: (
          <ProtectedRoute roles={['admin', 'author']}>
            <Write />
          </ProtectedRoute>
        ),
      },
      {
        path: '/me',
        element: (
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        ),
      },
      {
        path: '/me/favorites',
        element: (
          <ProtectedRoute>
            <Favorites />
          </ProtectedRoute>
        ),
      },
      {
        path: '/admin',
        element: (
          <ProtectedRoute roles={['admin']}>
            <AdminLayout />
          </ProtectedRoute>
        ),
        children: [
          { index: true, element: <Navigate to="/admin/users" replace /> },
          { path: 'users', element: <AdminUsers /> },
          { path: 'comments', element: <AdminComments /> },
          { path: 'categories', element: <AdminCategories /> },
          { path: 'tags', element: <AdminTags /> },
        ],
      },
      { path: '/login', element: <Login /> },
      { path: '/register', element: <Register /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
