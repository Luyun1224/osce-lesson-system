import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import {
  Plus,
  Search,
  Filter,
  BookOpen,
  Clock,
  CheckCircle,
  XCircle,
  Edit,
  Trash2,
  Eye
} from 'lucide-react';
import { lessonAPI } from '../services/api';
import toast from 'react-hot-toast';

const Lessons = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');

  const { data: lessonsData, isLoading, refetch } = useQuery(
    ['lessons', { search: searchTerm, status: statusFilter, sortBy }],
    () => lessonAPI.getAll({
      search: searchTerm || undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      sortBy
    })
  );

  const lessons = lessonsData?.data || [];

  const handleDelete = async (id) => {
    if (window.confirm('確定要刪除這個教案嗎？此操作無法復原。')) {
      try {
        await lessonAPI.delete(id);
        toast.success('教案已刪除');
        refetch();
      } catch (error) {
        toast.error('刪除失敗：' + (error.response?.data?.message || error.message));
      }
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case 'rejected':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <BookOpen className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'approved':
        return '已通過';
      case 'pending':
        return '待審核';
      case 'rejected':
        return '被拒絕';
      default:
        return '草稿';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">教案管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            管理您的 OSCE 教案，創建、編輯和組織教學內容
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Link to="/lessons/create" className="btn-primary">
            <Plus className="h-5 w-5 mr-2" />
            建立新教案
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="搜尋教案..."
              className="input pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <select
              className="input pl-10 appearance-none"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">所有狀態</option>
              <option value="draft">草稿</option>
              <option value="pending">待審核</option>
              <option value="approved">已通過</option>
              <option value="rejected">被拒絕</option>
            </select>
          </div>

          {/* Sort */}
          <select
            className="input"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="created_at">建立時間</option>
            <option value="updated_at">更新時間</option>
            <option value="title">標題</option>
            <option value="subject">科目</option>
          </select>
        </div>
      </div>

      {/* Lessons List */}
      <div className="card">
        {isLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-500">載入中...</p>
          </div>
        ) : lessons.length === 0 ? (
          <div className="text-center py-8">
            <BookOpen className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-4 text-gray-500">
              {searchTerm || statusFilter !== 'all' ? '沒有找到符合條件的教案' : '還沒有教案'}
            </p>
            {!searchTerm && statusFilter === 'all' && (
              <Link to="/lessons/create" className="mt-4 btn-primary">
                <Plus className="h-4 w-4 mr-2" />
                建立第一個教案
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    教案
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    科目
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    狀態
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    建立時間
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {lessons.map((lesson) => (
                  <tr key={lesson.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {lesson.title}
                        </div>
                        <div className="text-sm text-gray-500 truncate max-w-xs">
                          {lesson.description}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                        {lesson.subject}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {getStatusIcon(lesson.status)}
                        <span className={`ml-2 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(lesson.status)}`}>
                          {getStatusText(lesson.status)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(lesson.created_at).toLocaleDateString('zh-TW')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <Link
                          to={`/lessons/${lesson.id}`}
                          className="text-blue-600 hover:text-blue-900"
                          title="查看"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        <Link
                          to={`/lessons/${lesson.id}/edit`}
                          className="text-gray-600 hover:text-gray-900"
                          title="編輯"
                        >
                          <Edit className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => handleDelete(lesson.id)}
                          className="text-red-600 hover:text-red-900"
                          title="刪除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Lessons;