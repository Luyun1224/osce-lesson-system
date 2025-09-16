import React from 'react';
import { useParams } from 'react-router-dom';

const LessonDetail = () => {
  const { id } = useParams();

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-2xl font-bold text-gray-900">教案詳情</h1>
        <p className="mt-2 text-gray-600">教案 ID: {id}</p>
        <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
          <p className="text-yellow-800">此頁面正在開發中...</p>
        </div>
      </div>
    </div>
  );
};

export default LessonDetail;