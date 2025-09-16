import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import {
  BookOpen,
  Users,
  CheckCircle,
  Clock,
  Plus,
  TrendingUp,
  FileText,
  Brain
} from 'lucide-react';
import { lessonAPI, adminAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const Dashboard = () => {
  const { user } = useAuth();

  const { data: lessons } = useQuery('dashboard-lessons', () =>
    lessonAPI.getAll({ limit: 5 })
  );

  const { data: stats } = useQuery('dashboard-stats', () =>
    adminAPI.getStats().catch(() => ({ data: {} }))
  );

  const recentLessons = lessons?.data || [];
  const statsData = stats?.data || {};

  const cards = [
    {
      title: '總教案數',
      value: statsData.totalLessons || 0,
      icon: BookOpen,
      color: 'bg-blue-500',
      change: '+12%',
    },
    {
      title: '待審核',
      value: statsData.pendingReview || 0,
      icon: Clock,
      color: 'bg-yellow-500',
      change: '+5%',
    },
    {
      title: '已通過',
      value: statsData.approved || 0,
      icon: CheckCircle,
      color: 'bg-green-500',
      change: '+8%',
    },
    {
      title: '使用者數',
      value: statsData.totalUsers || 0,
      icon: Users,
      color: 'bg-purple-500',
      change: '+3%',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-lg p-6 text-white">
        <h1 className="text-2xl font-bold mb-2">
          歡迎回來，{user?.username}！
        </h1>
        <p className="opacity-90">
          今天是開發優質 OSCE 教案的好日子，讓我們一起創造更好的醫學教育內容。
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card, index) => {
          const Icon = card.icon;
          return (
            <div key={index} className="card">
              <div className="flex items-center">
                <div className={`p-3 rounded-full ${card.color}`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">{card.title}</p>
                  <div className="flex items-center">
                    <p className="text-2xl font-semibold text-gray-900">{card.value}</p>
                    <span className="ml-2 text-sm text-green-600 flex items-center">
                      <TrendingUp className="h-4 w-4 mr-1" />
                      {card.change}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Lessons */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">最近的教案</h2>
              <Link
                to="/lessons"
                className="text-primary-600 hover:text-primary-700 text-sm font-medium"
              >
                查看全部
              </Link>
            </div>

            {recentLessons.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="mx-auto h-12 w-12 text-gray-300" />
                <p className="mt-4 text-gray-500">還沒有教案</p>
                <Link
                  to="/lessons/create"
                  className="mt-2 inline-flex items-center btn-primary"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  建立第一個教案
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {recentLessons.map((lesson) => (
                  <div
                    key={lesson.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <h3 className="font-medium text-gray-900">{lesson.title}</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {lesson.subject} • {new Date(lesson.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          lesson.status === 'approved'
                            ? 'bg-green-100 text-green-800'
                            : lesson.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {lesson.status === 'approved' ? '已通過' :
                         lesson.status === 'pending' ? '待審核' : '草稿'}
                      </span>
                      <Link
                        to={`/lessons/${lesson.id}`}
                        className="text-primary-600 hover:text-primary-700 text-sm"
                      >
                        查看
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">快速操作</h2>
            <div className="space-y-4">
              <Link
                to="/lessons/create"
                className="flex items-center p-4 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
              >
                <Plus className="h-6 w-6 text-primary-600" />
                <div className="ml-3">
                  <p className="font-medium text-primary-900">建立新教案</p>
                  <p className="text-sm text-primary-600">開始設計新的 OSCE 案例</p>
                </div>
              </Link>

              <Link
                to="/lessons?tab=ai"
                className="flex items-center p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
              >
                <Brain className="h-6 w-6 text-purple-600" />
                <div className="ml-3">
                  <p className="font-medium text-purple-900">AI 輔助生成</p>
                  <p className="text-sm text-purple-600">使用 AI 快速生成教案</p>
                </div>
              </Link>

              <Link
                to="/knowledge"
                className="flex items-center p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
              >
                <BookOpen className="h-6 w-6 text-green-600" />
                <div className="ml-3">
                  <p className="font-medium text-green-900">管理知識庫</p>
                  <p className="text-sm text-green-600">組織和更新教學資源</p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;