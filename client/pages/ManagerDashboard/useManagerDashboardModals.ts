import { useState, useRef } from "react";

export function useManagerDashboardModals() {
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showEditTemplateModal, setShowEditTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<
    import("@shared/api").TaskTemplateWithRelations | null
  >(null);

  const settingsModalRef = useRef<HTMLDivElement | null>(null);

  return {
    showNewTaskModal,
    setShowNewTaskModal,
    showSettingsModal,
    setShowSettingsModal,
    openSettingsModal: () => setShowSettingsModal(true),
    settingsModalRef,
    showEditTemplateModal,
    setShowEditTemplateModal,
    editingTemplate,
    setEditingTemplate,
  };
}
