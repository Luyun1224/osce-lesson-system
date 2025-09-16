import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const Profile = () => {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-2xl font-bold text-gray-900">個人資料</h1>
        <div className="mt-4">
          <p><strong>用戶名：</strong> {user?.username}</p>
          <p><strong>電子郵件：</strong> {user?.email}</p>
        </div>
        <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
          <p className="text-yellow-800">個人資料編輯功能正在開發中...</p>
        </div>
      </div>
    </div>
  );
};

export default Profile;